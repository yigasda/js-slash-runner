import { destroyIframe } from '@/component/message_iframe';
import { ScriptData } from '@/component/script_repository/data';
import { scriptEvents, ScriptRepositoryEventType } from '@/component/script_repository/events';
import { IFrameElement, Script, ScriptType } from '@/component/script_repository/types';
import { script_url } from '@/script_url';
import third_party from '@/third_party.html';
import { getSettingValue } from '@/util/extension_variables';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { uuidv4 } from '@sillytavern/scripts/utils';

class ScriptExecutor {
  /**
   * 단일 스크립트 생성 및 실행
   * @param script 스크립트
   * @param type 스크립트 타입
   */
  async runScript(script: Script, type: ScriptType): Promise<void> {
    const typeName = type === ScriptType.GLOBAL ? '전역' : '지역';

    try {
      // 동일한 이름의 iframe이 이미 존재하는지 확인하고, 존재하면 제거
      const iframeElement = $('iframe').filter(
        (_index, element) => $(element).attr('script-id') === script.id,
      )[0] as IFrameElement;

      if (iframeElement) {
        await destroyIframe(iframeElement);
      }

      // 스크립트 실행을 위한 HTML 콘텐츠 생성
      const htmlContent = this.createScriptHtml(script);

      // 새 iframe 요소 생성
      const $iframe = $('<iframe>', {
        style: 'display: none;',
        id: `tavern-helper-script-${script.name}`,
        srcdoc: htmlContent,
        'script-id': script.id,
      });

      // 로드 이벤트 설정
      $iframe.on('load', () => {
        console.info(`[Script] ${typeName} 스크립트 ["${script.name}"] 활성화됨`);
      });

      // 페이지에 추가
      $('body').append($iframe);
    } catch (error) {
      console.error(`[Script] ${typeName} 스크립트 활성화 실패:["${script.name}"]`, error);
      toastr.error(`${typeName} 스크립트 활성화 실패:["${script.name}"]`);
      throw error;
    }
  }

  /**
   * 단일 스크립트 중지 및 iframe 제거
   * @param script 스크립트
   * @param type 스크립트 타입
   */
  async stopScript(script: Script, type: ScriptType): Promise<void> {
    const typeName = type === ScriptType.GLOBAL ? '전역' : '지역';

    const iframeElement = $('iframe').filter(
      (_index, element) => $(element).attr('script-id') === script.id,
    )[0] as IFrameElement;

    if (iframeElement) {
      await destroyIframe(iframeElement);
      console.info(`[Script] ${typeName} 스크립트 ["${script.name}"] 비활성화됨`);
    }
  }

  /**
   * 스크립트 실행을 위한 HTML 콘텐츠 생성
   * @param script 스크립트 객체
   * @returns HTML 콘텐츠
   */
  private createScriptHtml(script: Script): string {
    return `
      <html>
      <head>
        ${third_party}
        <script>
          (function ($) {
            var original$ = $;
            window.$ = function (selector, context) {
              if (context === undefined || context === null) {
                if (window.parent && window.parent.document) {
                  context = window.parent.document;
                } else {
                  console.warn('window.parent.document에 접근할 수 없습니다. 현재 iframe의 document를 컨텍스트로 사용합니다.');
                  context = window.document;
                }
              }
              return original$(selector, context);
            };
          })(jQuery);

          SillyTavern = window.parent.SillyTavern.getContext();
          TavernHelper = window.parent.TavernHelper;
          for (const key in TavernHelper) {
            window[key] = TavernHelper[key];
          }
        </script>
        <script src="${script_url.get('iframe_client')}"></script>
      </head>
      <body>
        <script type="module">
          ${script.content}
        </script>
      </body>
      </html>
    `;
  }

  /**
   * 모든 스크립트 iframe 정리
   */
  async clearAllScriptsIframe(): Promise<void> {
    const $iframes = $('iframe[id^="tavern-helper-script-"]');
    for (const iframe of $iframes) {
      await destroyIframe(iframe as IFrameElement);
    }
  }
}

/**
 * 스크립트 관리자 - 스크립트 실행, 중지 등 핵심 기능 담당
 * 통합 진입점 역할을 하며, 내부적으로 ScriptExecutor를 사용하여 구체적인 실행 처리
 */
export class ScriptManager {
  private static instance: ScriptManager;
  private scriptData: ScriptData;
  private executor: ScriptExecutor;

  private constructor() {
    this.scriptData = ScriptData.getInstance();
    this.executor = new ScriptExecutor();
    this.registerEventListeners();
  }

  /**
   * 스크립트 관리자 인스턴스 가져오기
   */
  public static getInstance(): ScriptManager {
    if (!ScriptManager.instance) {
      ScriptManager.instance = new ScriptManager();
    }
    return ScriptManager.instance;
  }

  /**
   * 스크립트 관리자 인스턴스 제거
   */
  public static destroyInstance(): void {
    if (ScriptManager.instance) {
      ScriptManager.instance = undefined as unknown as ScriptManager;
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  private registerEventListeners(): void {
    // 스크립트 전환 이벤트
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_TOGGLE, async data => {
      const { script, type, enable, userInput = true } = data;
      await this.toggleScript(script, type, enable, userInput);
    });

    // 타입 전환 이벤트
    scriptEvents.on(ScriptRepositoryEventType.TYPE_TOGGLE, async data => {
      const { type, enable, userInput = true } = data;
      await this.toggleScriptType(type, enable, userInput);
    });

    // 스크립트 가져오기 이벤트
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_IMPORT, async data => {
      const { file, type } = data;
      await this.importScript(file, type);
    });

    // 스크립트 삭제 이벤트
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_DELETE, async data => {
      const { scriptId, type } = data;
      await this.deleteScript(scriptId, type);
    });

    // 스크립트 저장 이벤트
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_SAVE, async data => {
      const { script, type } = data;
      await this.saveScript(script, type);
    });

    // 스크립트 이동 이벤트
    scriptEvents.on(ScriptRepositoryEventType.SCRIPT_MOVE, async data => {
      const { script, fromType } = data;
      await this.moveScript(script, fromType);
    });

    // UI 로드 완료 이벤트 - 활성화된 스크립트 자동 실행
    scriptEvents.on(ScriptRepositoryEventType.UI_LOADED, async () => {
      if (!getSettingValue('enabled_extension')) {
        return;
      }

      // 전역 및 캐릭터 스크립트 목록 가져오기
      const globalScripts = this.scriptData.getGlobalScripts();
      const characterScripts = this.scriptData.getCharacterScripts();

      // 전역 스크립트 타입 스위치가 활성화되어 있는지 확인
      if (this.scriptData.isGlobalScriptEnabled) {
        await this.runScriptsByType(globalScripts, ScriptType.GLOBAL);
      } else {
        console.info('[Script] 전역 스크립트 타입이 활성화되지 않아 전역 스크립트 실행 건너뜀');
      }

      // 캐릭터 스크립트 타입 스위치가 활성화되어 있는지 확인
      if (this.scriptData.isCharacterScriptEnabled) {
        await this.runScriptsByType(characterScripts, ScriptType.CHARACTER);
      } else {
        console.info('[Script] 캐릭터 스크립트 타입이 활성화되지 않아 캐릭터 스크립트 실행 건너뜀');
      }
    });
  }

  /**
   * 스크립트 활성화 상태 전환
   * @param script 스크립트
   * @param type 스크립트 타입
   * @param enable 활성화 여부
   * @param userInput 사용자 입력 여부
   */
  public async toggleScript(
    script: Script,
    type: ScriptType,
    enable: boolean,
    userInput: boolean = true,
  ): Promise<void> {
    if (userInput) {
      script.enabled = enable;
      await this.scriptData.saveScript(script, type);
    }

    try {
      if (enable) {
        // 해당 타입의 스크립트 전체 스위치가 활성화되어 있는지 확인
        if (type === ScriptType.GLOBAL && !this.scriptData.isGlobalScriptEnabled) {
          console.info(`[script_manager] 전역 스크립트 타입이 활성화되지 않아 스크립트 ["${script.name}"] 활성화 건너뜀`);
          return;
        }
        if (type === ScriptType.CHARACTER && !this.scriptData.isCharacterScriptEnabled) {
          console.info(`[script_manager] 캐릭터 스크립트 타입이 활성화되지 않아 스크립트 ["${script.name}"] 활성화 건너뜀`);
          return;
        }

        await this.runScript(script, type);
      } else {
        await this.stopScript(script, type);
      }

      scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
        action: 'script_toggled',
        script,
        type,
        enable,
      });
    } catch (error) {
      console.error(`[Script] 스크립트 상태 전환 실패: ${script.name}`, error);
      toastr.error(`스크립트 상태 전환 실패: ${script.name}`);
    }
  }

  /**
   * 스크립트 타입 활성화 상태 전환
   * @param type 스크립트 타입
   * @param enable 활성화 여부
   * @param userInput 사용자 입력 여부
   */
  public async toggleScriptType(type: ScriptType, enable: boolean, userInput: boolean = true): Promise<void> {
    if (userInput) {
      await this.scriptData.updateScriptTypeEnableState(type, enable);
    }

    try {
      const scripts =
        type === ScriptType.GLOBAL ? this.scriptData.getGlobalScripts() : this.scriptData.getCharacterScripts();

      if (enable) {
        await this.runScriptsByType(scripts, type);
      } else {
        await this.stopScriptsByType(scripts, type);
      }

      scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
        action: 'type_toggled',
        type,
        enable,
      });
    } catch (error) {
      console.error(`[Script] 스크립트 타입 상태 전환 실패: ${type}`, error);
      toastr.error(`스크립트 타입 상태 전환 실패: ${type}`);
    }
  }

  /**
   * 단일 스크립트 실행
   * @param script 스크립트
   * @param type 스크립트 타입
   */
  public async runScript(script: Script, type: ScriptType): Promise<void> {
    // 확장 프로그램이 활성화되어 있는지 확인
    if (!getSettingValue('enabled_extension')) {
      toastr.error('[Script] 확장 프로그램이 활성화되지 않았습니다.');
      return;
    }

    // 해당 타입의 스크립트가 활성화되어 있는지 확인
    if (type === ScriptType.GLOBAL && !this.scriptData.isGlobalScriptEnabled) {
      return;
    }
    if (type === ScriptType.CHARACTER && !this.scriptData.isCharacterScriptEnabled) {
      return;
    }

    // 스크립트 실행
    await this.executor.runScript(script, type);

    // 버튼 처리
    if (script.buttons && script.buttons.length > 0) {
      scriptEvents.emit(ScriptRepositoryEventType.BUTTON_ADD, { script });
    }
  }

  /**
   * 단일 스크립트 중지
   * @param script 스크립트
   * @param type 스크립트 타입
   */
  public async stopScript(script: Script, type: ScriptType): Promise<void> {
    await this.executor.stopScript(script, type);

    // 버튼 처리
    if (script.buttons && script.buttons.length > 0) {
      scriptEvents.emit(ScriptRepositoryEventType.BUTTON_REMOVE, { scriptId: script.id });
    }
  }

  /**
   * 지정된 타입의 모든 스크립트 실행
   * @param scripts 스크립트 목록
   * @param type 스크립트 타입
   */
  public async runScriptsByType(scripts: Script[], type: ScriptType): Promise<void> {
    if (!getSettingValue('enabled_extension')) {
      toastr.error('[Script] Tavern Helper가 활성화되지 않아 스크립트를 실행할 수 없습니다.');
      return;
    }

    // 해당 타입의 스크립트가 활성화되어 있는지 확인
    if (type === ScriptType.GLOBAL && !this.scriptData.isGlobalScriptEnabled) {
      return;
    }
    if (type === ScriptType.CHARACTER && !this.scriptData.isCharacterScriptEnabled) {
      return;
    }

    // 활성화된 스크립트 필터링
    const enabledScripts = scripts.filter(script => script.enabled);

    // 각 스크립트 실행
    for (const script of enabledScripts) {
      await this.executor.runScript(script, type);

      // 버튼 처리
      if (script.buttons && script.buttons.length > 0) {
        scriptEvents.emit(ScriptRepositoryEventType.BUTTON_ADD, { script });
      }
    }
  }

  /**
   * 지정된 타입의 모든 스크립트 중지
   * @param scripts 스크립트 목록
   * @param type 스크립트 타입
   */
  public async stopScriptsByType(scripts: Script[], type: ScriptType): Promise<void> {
    const enabledScripts = scripts.filter(script => script.enabled);

    for (const script of enabledScripts) {
      await this.executor.stopScript(script, type);

      // 버튼 처리
      if (script.buttons && script.buttons.length > 0) {
        scriptEvents.emit(ScriptRepositoryEventType.BUTTON_REMOVE, { scriptId: script.id });
      }
    }
  }

  /**
   * 스크립트 가져오기
   * @param file 파일
   * @param type 가져올 대상 타입
   */
  public async importScript(file: File, type: ScriptType): Promise<void> {
    try {
      const content = await this.readFileAsText(file);
      const scriptData = JSON.parse(content);

      if (!scriptData.name || !scriptData.content) {
        throw new Error('유효하지 않은 스크립트 데이터');
      }

      // 새 스크립트 객체 생성, 기본적으로 비활성화 상태
      const scriptToImport = new Script({
        ...scriptData,
        enabled: false,
      });

      // 전역 및 캐릭터 스크립트에서 ID 충돌이 있는지 각각 확인
      const globalScripts = this.scriptData.getGlobalScripts();
      const characterScripts = this.scriptData.getCharacterScripts();

      // 전역 스크립트에서 충돌 확인
      const conflictInGlobal = globalScripts.find(script => script.id === scriptToImport.id);
      // 캐릭터 스크립트에서 충돌 확인
      const conflictInCharacter = characterScripts.find(script => script.id === scriptToImport.id);

      // 충돌 여부 및 충돌 타입 결정
      let existingScript: Script | undefined;
      let conflictType: ScriptType | undefined;

      if (conflictInGlobal) {
        existingScript = conflictInGlobal;
        conflictType = ScriptType.GLOBAL;
      } else if (conflictInCharacter) {
        existingScript = conflictInCharacter;
        conflictType = ScriptType.CHARACTER;
      }

      // 충돌이 있는 경우 충돌 처리
      if (existingScript && conflictType) {
        const action = await this.handleScriptIdConflict(scriptToImport, existingScript, type);

        switch (action) {
          case 'new':
            // 새 ID 생성
            scriptToImport.id = uuidv4();
            await this.saveScript(scriptToImport, type);
            break;
          case 'override':
            // 충돌하는 스크립트 먼저 삭제 (주의: 충돌 스크립트의 실제 타입 사용)
            await this.deleteScript(existingScript.id, conflictType);
            // 새 스크립트를 대상 타입에 저장
            await this.saveScript(scriptToImport, type);
            break;
          case 'cancel':
            return;
        }
      } else {
        // 충돌 없음, 바로 저장
        await this.saveScript(scriptToImport, type);
      }

      scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
        action: 'script_imported',
        script: scriptToImport,
        type,
      });

      toastr.success(`스크립트 '${scriptToImport.name}' 가져오기 성공.`);
    } catch (error) {
      console.error('[script_repository] 스크립트 가져오기 실패:', error);
      toastr.error('유효하지 않은 JSON 파일입니다.');
    }
  }

  /**
   * 파일 내용을 텍스트로 읽기 - 콜백 대신 Promise 사용
   * @param file 파일 객체
   * @returns 파일 내용
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = e => reject(e);
      reader.readAsText(file);
    });
  }

  /**
   * 스크립트 저장
   * @param script 스크립트
   * @param type 스크립트 타입
   */
  public async saveScript(script: Script, type: ScriptType): Promise<void> {
    await this.scriptData.saveScript(script, type);
    scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
      action: 'script_saved',
      script,
      type,
    });
  }

  /**
   * 스크립트 순서 저장
   * @param scripts 정렬된 스크립트 배열
   * @param type 스크립트 타입
   */
  public async saveScriptsOrder(scripts: Script[], type: ScriptType): Promise<void> {
    if (type === ScriptType.GLOBAL) {
      await this.scriptData.saveGlobalScripts(scripts);
    } else {
      await this.scriptData.saveCharacterScripts(scripts);
    }

    // 로컬 데이터 새로고침
    this.scriptData.loadScripts();
  }

  /**
   * 스크립트 삭제
   * @param scriptId 스크립트 ID
   * @param type 스크립트 타입
   */
  public async deleteScript(scriptId: string, type: ScriptType): Promise<void> {
    const script = this.scriptData.getScriptById(scriptId);
    if (!script) {
      throw new Error('[Script] 스크립트가 존재하지 않습니다.');
    }

    // 먼저 스크립트 중지
    await this.stopScript(script, type);

    // 스크립트 삭제
    await this.scriptData.deleteScript(scriptId, type);

    scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
      action: 'script_deleted',
      scriptId,
      type,
    });
  }

  /**
   * 스크립트를 다른 타입으로 이동
   * @param script 스크립트
   * @param fromType 원본 타입
   */
  public async moveScript(script: Script, fromType: ScriptType): Promise<void> {
    // 먼저 스크립트 중지
    await this.stopScript(script, fromType);

    // 대상 타입 결정
    const targetType = fromType === ScriptType.GLOBAL ? ScriptType.CHARACTER : ScriptType.GLOBAL;

    // 대상 타입에 동일한 ID의 스크립트가 이미 존재하는지 확인
    const existingScriptInTarget = this.scriptData.getScriptById(script.id);
    const existingScriptType = existingScriptInTarget ? this.scriptData.getScriptType(existingScriptInTarget) : null;

    // 대상 타입에 동일 ID 스크립트가 이미 있는 경우에만 충돌 처리
    if (existingScriptInTarget && existingScriptType === targetType) {
      const action = await this.handleScriptIdConflict(script, existingScriptInTarget, targetType);

      switch (action) {
        case 'new':
          // 새 ID 생성
          script.id = uuidv4();
          break;
        case 'override':
          // 대상 타입의 스크립트 먼저 삭제
          await this.deleteScript(existingScriptInTarget.id, targetType);
          break;
        case 'cancel':
          // 이동 작업 취소
          return;
      }
    }

    // 스크립트 이동
    await this.scriptData.moveScriptToOtherType(script, fromType);

    scriptEvents.emit(ScriptRepositoryEventType.UI_REFRESH, {
      action: 'script_moved',
      script,
      fromType,
      targetType,
    });

    // 대상 타입이 활성화되어 있고 스크립트 자체가 활성화 상태이면 스크립트 실행
    if (
      script.enabled &&
      ((targetType === ScriptType.GLOBAL && this.scriptData.isGlobalScriptEnabled) ||
        (targetType === ScriptType.CHARACTER && this.scriptData.isCharacterScriptEnabled))
    ) {
      await this.runScript(script, targetType);
    }
  }

  /**
   * 캐릭터 스크립트 데이터 새로고침
   */
  public refreshCharacterScriptData(): void {
    this.scriptData.getCharacterScripts();
  }

  /**
   * 전역 스크립트 가져오기
   */
  public getGlobalScripts(): Script[] {
    return this.scriptData.getGlobalScripts();
  }

  /**
   * 캐릭터 스크립트 가져오기
   */
  public getCharacterScripts(): Script[] {
    return this.scriptData.getCharacterScripts();
  }

  /**
   * 캐릭터 스크립트 활성화 상태 새로고침
   */
  public refreshCharacterScriptEnabledState(): void {
    this.scriptData.refreshCharacterScriptEnabledState();
  }

  /**
   * 전역 스크립트 활성화 상태 가져오기
   */
  public get isGlobalScriptEnabled(): boolean {
    return this.scriptData.isGlobalScriptEnabled;
  }

  /**
   * 캐릭터 스크립트 활성화 상태 가져오기
   */
  public get isCharacterScriptEnabled(): boolean {
    return this.scriptData.isCharacterScriptEnabled;
  }

  /**
   * ID로 스크립트 가져오기
   * @param id 스크립트 ID
   */
  public getScriptById(id: string): Script | undefined {
    return this.scriptData.getScriptById(id);
  }

  /**
   * 모든 리소스 정리
   */
  public async cleanup(): Promise<void> {
    await this.executor.clearAllScriptsIframe();
  }

  /**
   * 스크립트 ID 충돌 처리
   * @param script 처리할 스크립트
   * @param existingScript 이미 존재하는 스크립트
   * @param targetType 대상 타입
   * @returns 처리 결과: 'new' - 새 ID 사용, 'override' - 기존 스크립트 덮어쓰기, 'cancel' - 작업 취소
   */
  public async handleScriptIdConflict(
    script: Script,
    existingScript: Script,
    targetType: ScriptType,
  ): Promise<'new' | 'override' | 'cancel'> {
    // 이미 존재하는 스크립트의 타입 텍스트 가져오기
    const existingScriptType = this.scriptData.getScriptType(existingScript);
    const existingTypeText = existingScriptType === ScriptType.GLOBAL ? '전역 스크립트' : '캐릭터 스크립트';

    // 대상 타입 텍스트 가져오기
    const targetTypeText = targetType === ScriptType.GLOBAL ? '전역 스크립트' : '캐릭터 스크립트';

    // 충돌 처리 옵션 표시
    const input = await callGenericPopup(
      `${targetType === existingScriptType ? '가져올' : '이동할'} 스크립트 '${script.name}'이(가) ${existingTypeText} 라이브러리의 '${
        existingScript.name
      }'와(과) ID가 동일합니다. 계속 진행하시겠습니까?`,
      POPUP_TYPE.TEXT,
      '',
      {
        okButton: '기존 스크립트 덮어쓰기',
        cancelButton: '취소',
        customButtons: ['새 스크립트로 만들기'],
      },
    );

    let action: 'new' | 'override' | 'cancel' = 'cancel';

    switch (input) {
      case 0: // 취소 버튼에 해당 (라이브러리 기본값)
        action = 'cancel';
        break;
      case 1: // 확인 버튼에 해당 (okButton)
        action = 'override';
        break;
      case 2: // 사용자 정의 버튼 0 (customButtons[0])
        action = 'new';
        break;
    }

    return action;
  }
}