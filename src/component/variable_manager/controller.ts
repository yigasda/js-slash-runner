import { VariableModel } from '@/component/variable_manager/model';
import { VariableSyncService } from '@/component/variable_manager/sync';
import { VariableDataType, VariableType } from '@/component/variable_manager/types';
import { VariableView } from '@/component/variable_manager/view';

export class VariableController {
  /**
   * 변수 데이터 모델
   */
  private model: VariableModel;

  /**
   * 변수 뷰
   */
  private view: VariableView;

  /**
   * 변수 동기화 서비스
   */
  private syncService: VariableSyncService;

  /**
   * 생성자
   * @param model 데이터 모델
   * @param view 뷰
   * @param syncService 동기화 서비스
   */
  constructor(model: VariableModel, view: VariableView, syncService: VariableSyncService) {
    this.model = model;
    this.view = view;
    this.syncService = syncService;
  }

  /**
   * 컨트롤러 초기화
   * @param container UI 컨테이너
   */
  public async init(container: JQuery<HTMLElement>): Promise<void> {
    this.view.initUI();
    this.bindEvents(container);

    try {
      // 사전 로드 변수 시에도 내부 작업 플래그를 사용하도록 보장
      this.model.beginInternalOperation();
      const preloadedVariables = await this.syncService.setCurrentType('global');
      this.syncService.activateListeners();
      await this.loadVariables('global', preloadedVariables);
    } finally {
      this.model.endInternalOperation();
    }
  }

  /**
   * UI 이벤트 바인딩
   * @param container UI 컨테이너
   */
  private bindEvents(container: JQuery<HTMLElement>): void {
    container.find('.tab-item').on('click', this.handleTabChange.bind(this));
    container.on('click', '.add-list-item', this.handleAddListItem.bind(this));
    container.on('click', '.list-item-delete', this.handleDeleteListItem.bind(this));
    container.on('click', '.delete-btn, .object-delete-btn', this.handleDeleteVariableCard.bind(this));
    container.on('click', '.save-btn, .object-save-btn', this.handleSaveVariableCard.bind(this));
    container.on('click', '#add-variable', this.handleAddVariable.bind(this));
    container.on('click', '#clear-all', this.handleClearAll.bind(this));
    container.on('click', '#filter-icon', this.handleFilterIconClick.bind(this));
    container.on('change', '.filter-checkbox', this.handleFilterOptionChange.bind(this));
    container.on('input', '#variable-search', this.handleVariableSearch.bind(this));
    container.on('click', '#floor-filter-btn', this.handleFloorRangeFilter.bind(this));
  }

  /**
   * 변수 로드
   * @param type 변수 타입
   * @param preloadedVariables 사전 로드된 변수 데이터
   */
  public async loadVariables(type: VariableType, preloadedVariables?: Record<string, any>): Promise<void> {
    // 로드 중이면 중복 요청 무시
    if (this.model.isLoading) {
      console.log(`[VariableController] ${type} 변수 로드 중복 요청 무시`);
      return;
    }

    const isListeningActive = this.syncService['_listenersActive'];
    if (isListeningActive) {
      this.syncService.deactivateListeners();
    }

    try {
      this.model.beginInternalOperation();

      // 변수 데이터 로드
      const loadSuccess = await this.model.loadVariables(type, preloadedVariables);

      if (!loadSuccess) {
        console.warn(`[VariableController] ${type} 변수 로드가 완료되지 않았거나 취소됨`);
        return;
      }

      // UI 관련 설정 업데이트
      if (type === 'message') {
        this.view.getContainer().find('#floor-filter-container').show();
        const [minFloor, maxFloor] = this.model.getFloorRange();
        this.view.updateFloorRangeInputs(minFloor, maxFloor);
      } else {
        this.view.getContainer().find('#floor-filter-container').hide();
      }

      // 변수 카드 표시 새로고침
      this.refreshVariableCards();
    } finally {
      this.model.endInternalOperation();

      if (isListeningActive) {
        this.syncService.activateListeners();
      }
    }
  }

  /**
   * 현재 활성 변수 강제 새로고침
   */
  public forceRefresh(): void {
    try {
      this.model.beginInternalOperation();
      this.model.forceRefreshVariables();
      this.refreshVariableCards();
    } catch (error) {
      console.error(`[VariableManager] 변수 데이터 강제 새로고침 실패:`, error);
    } finally {
      this.model.endInternalOperation();
    }
  }

  /**
   * 변수 카드 새로고침
   */
  private refreshVariableCards(): void {
    const type = this.model.getActiveVariableType();

    try {
      const filteredVariables = this.model.filterVariables();
      this.view.refreshVariableCards(type, filteredVariables);
    } catch (error) {
      console.error(`[VariableManager] 변수 카드 새로고침 실패:`, error);
    }
  }

  /**
   * 탭 변경 처리
   * @param event 클릭 이벤트
   */
  private async handleTabChange(event: JQuery.ClickEvent): Promise<void> {
    const target = $(event.currentTarget);
    const tabId = target.attr('id');

    if (!tabId) return;

    const type = tabId.replace('-tab', '') as VariableType;
    const currentType = this.model.getActiveVariableType();

    if (type === currentType) return;

    // 먼저 UI 탭 상태 업데이트
    this.view.setActiveTab(type);

    // 현재 리스너 비활성화
    this.syncService.deactivateListeners();

    // 새 변수 타입 설정 및 사전 로드된 변수 가져오기
    const preloadedVariables = await this.syncService.setCurrentType(type);

    // 새 타입의 변수 로드 (사전 로드된 변수를 사용하여 중복 가져오기 방지)
    await this.loadVariables(type, preloadedVariables);

    // 새 타입의 리스너 활성화
    this.syncService.activateListeners();
  }

  /**
   * 목록 항목 추가 처리
   * @param event 클릭 이벤트
   */
  private handleAddListItem(event: JQuery.ClickEvent): void {
    const button = $(event.currentTarget);
    const listContainer = button.siblings('.list-items-container');

    const newItem = $(`
      <div class="list-item">
        <span class="drag-handle">☰</span>
        <textarea class="variable-content-input" placeholder="변수 내용 입력"></textarea>
        <button class="list-item-delete"><i class="fa-solid fa-times"></i></button>
      </div>
    `);

    listContainer.append(newItem);
    newItem.find('textarea').focus();
  }

  /**
   * 목록 항목 삭제 처리
   * @param event 클릭 이벤트
   */
  private handleDeleteListItem(event: JQuery.ClickEvent): void {
    const button = $(event.currentTarget);
    const listItem = button.closest('.list-item');

    // 삭제 애니메이션 효과 추가
    listItem.css({
      'background-color': 'rgba(255, 0, 0, 0.2)',
      transition: 'all 0.3s ease',
    });

    // 전환 효과 적용
    setTimeout(() => {
      listItem.css({
        transform: 'scale(0.9)',
        opacity: '0.7',
      });

      // 페이드 아웃 효과 완료 후 요소 제거
      setTimeout(() => {
        listItem.remove();
      }, 200);
    }, 50);
  }

  /**
   * 변수 카드 삭제 처리
   * @param event 클릭 이벤트
   */
  private handleDeleteVariableCard(event: JQuery.ClickEvent): void {
    // 디버그 로그 추가, 이벤트 정보 기록
    console.log('[VariableManager] 변수 카드 삭제 - 이벤트 객체:', {
      target: event.target,
      currentTarget: event.currentTarget,
      targetClass: event.target.className,
      currentTargetClass: event.currentTarget.className,
    });

    const button = $(event.currentTarget);
    const card = button.closest('.variable-card');
    const name = this.view.getVariableCardName(card);
    const type = this.model.getActiveVariableType();

    // 층 정보 가져오기 (층 패널 내에 있는 경우)
    let floorId: number | undefined = undefined;
    if (type === 'message') {
      const floorPanel = card.closest('.floor-panel');
      if (floorPanel.length > 0) {
        floorId = parseInt(floorPanel.attr('data-floor') || '', 10);
        if (isNaN(floorId)) {
          floorId = undefined;
        }
      }
    }

    this.view.showConfirmDialog(`변수 "${name}"을(를) 삭제하시겠습니까?`, async confirmed => {
      if (confirmed) {
        try {
          this.model.beginInternalOperation();
          if (event.currentTarget.className.includes('object-delete-btn')) {
            console.log('[VariableManager] 객체 속성 삭제 처리 - 버튼:', event.currentTarget);
            // 객체 하위 요소 삭제 처리
            const nestedWrapper = $(event.currentTarget).closest('.nested-card-wrapper');
            const topLevelCard = nestedWrapper.closest('.variable-card');
            const objectName = this.view.getVariableCardName(topLevelCard);
            const objectValue = this.model.getVariableValue(objectName);
            if (objectValue && typeof objectValue === 'object') {
              // 삭제할 하위 요소의 키 이름 가져오기
              const deleteButton = $(event.currentTarget);
              let keyToDelete = deleteButton.attr('data-nested-key');

              // 버튼에서 키 이름을 찾을 수 없는 경우 래퍼 요소에서 가져오기 시도
              if (!keyToDelete) {
                let nestedCard = deleteButton.closest('.nested-card-wrapper');
                // currentTarget을 사용하여 찾지 못한 경우 target 사용 시도 (하위 호환성)
                if (nestedCard.length === 0) {
                  nestedCard = $(event.target).closest('.nested-card-wrapper');
                }
                keyToDelete = nestedCard.attr('data-key');
              }

              if (keyToDelete && objectValue[keyToDelete] !== undefined) {
                // lodash를 사용하여 객체에서 하위 요소 삭제
                _.unset(objectValue, keyToDelete);

                // 업데이트된 객체 저장
                await this.model.saveVariableData(type, objectName, objectValue);
                // data-value 업데이트
                const objectCard = this.view.getContainer().find(`.variable-card[data-name="${objectName}"]`);
                objectCard.attr('data-value', JSON.stringify(objectValue));

                const nestedWrapperToRemove = this.view
                  .getContainer()
                  .find(`.nested-card-wrapper[data-key="${keyToDelete}"]`);
                if (nestedWrapperToRemove.length > 0) {
                  const callback = () => {
                    nestedWrapperToRemove.remove();
                  };
                  this.view.addAnimation(nestedWrapperToRemove,"variable-deleted", callback);
                }
              }
            }
          } else {
            // 전체 변수 삭제
            await this.model.deleteVariableData(type, name, floorId);
            this.view.removeVariableCard(name);
          }
        } catch (error) {
          console.error(`[VariableManager] 변수 삭제 실패:`, error);
        } finally {
          this.model.endInternalOperation();
        }
      }
    });
  }

  /**
   * 변수 추가 처리
   */
  private async handleAddVariable(): Promise<void> {
    const type = this.model.getActiveVariableType();

    this.view.showAddVariableDialog((dataType, floorId) => {
      try {
        this.model.beginInternalOperation();
        this.view.createNewVariableCard(type, dataType, floorId);
      } finally {
        this.model.endInternalOperation();
      }
    });
  }

  /**
   * 변수 카드 저장 처리
   *
   * @param event 클릭 이벤트
   */
  private async handleSaveVariableCard(event: JQuery.ClickEvent): Promise<void> {
    const button = $(event.currentTarget);
    const card = button.closest('.variable-card');
    const oldName = card.attr('data-original-name') || '';
    const newName = this.view.getVariableCardName(card);
    const type = this.model.getActiveVariableType();
    const value = this.view.getVariableCardValue(card);
    const isNewCard = card.attr('data-status') === 'new';

    // 객체 속성 저장 버튼인지 확인
    if (button.hasClass('object-save-btn')) {
      const nestedWrapper = button.closest('.nested-card-wrapper');
      const topLevelCard = nestedWrapper.closest('.variable-card');

      // 부모 객체 이름 가져오기
      const parentObjectName = this.view.getVariableCardName(topLevelCard);

      // 현재 편집 중인 속성의 키 이름 가져오기
      const propertyKey = nestedWrapper.attr('data-key');

      if (!propertyKey) {
        console.error('[VariableManager] 객체 속성의 키 이름을 가져올 수 없습니다');
        toastr.error('객체 속성 저장 실패: 속성 이름을 식별할 수 없습니다');
        return;
      }

      try {
        this.model.beginInternalOperation();

        let parentObjectValue = this.model.getVariableValue(parentObjectName);

        if (!parentObjectValue || typeof parentObjectValue !== 'object') {
          parentObjectValue = {};
        }

        const propertyInput = nestedWrapper.find('.nested-value-input');
        let newPropertyValue;
        if (propertyInput.is('textarea, input[type="text"]')) {
          newPropertyValue = propertyInput.val();
        } else if (propertyInput.is('input[type="checkbox"]')) {
          newPropertyValue = propertyInput.prop('checked');
        } else if (propertyInput.is('select')) {
          newPropertyValue = propertyInput.val();
        } else {
          newPropertyValue = propertyInput.text() || propertyInput.val();
        }

        _.set(parentObjectValue, propertyKey, newPropertyValue);

        await this.model.saveVariableData(type, parentObjectName, parentObjectValue);

        // 부모 객체 카드의 data-value 속성 업데이트
        topLevelCard.attr('data-value', JSON.stringify(parentObjectValue));
      } catch (error: any) {
        console.error(`[VariableManager] 객체 속성 저장 실패:`, error);
        toastr.error(`객체 속성 저장 중 오류 발생: ${error.message || '알 수 없는 오류'}`);
      } finally {
        this.model.endInternalOperation();
      }
      return;
    }


    // 층 ID 가져오기 (message 타입용)
    const floorId = type === 'message' ? parseInt(card.attr('data-floor') || '-1', 10) : undefined;

    if (!newName || newName.trim() === '') {
      toastr.error('변수 이름은 비워둘 수 없습니다');
      return;
    }

    try {
      this.model.beginInternalOperation();

      if (isNewCard) {
        // 새 카드의 경우, 새 이름이 기존 변수와 중복되는지만 확인
        if (this.model.getVariableValue(newName) !== undefined) {
          toastr.error(`변수명 "${newName}"이(가) 이미 존재합니다. 다른 이름을 사용해주세요.`);
          return;
        }

        // 새 변수 저장 (타입에 따라 message_id 전달 여부 결정)
        if (type === 'message' && floorId !== undefined && floorId >= 0) {
          await this.model.saveVariableData(type, newName, value, floorId);
        } else {
          await this.model.saveVariableData(type, newName, value);
        }

        // updateVariableCard를 사용하여 UI 업데이트 및 새 카드 저장 완료로 표시
        this.view.updateVariableCard(newName, value, true);

        // 채팅 변수의 경우, 최근 처리 기록에 추가하여 폴링으로 인한 중복 처리 방지
        if (type === 'chat') {
          this.syncService.markVariableAsProcessed(newName);
        }
      } else if (oldName !== newName) {
        // 변수 이름 변경
        if (this.model.getVariableValue(newName) !== undefined) {
          toastr.error(`변수명 "${newName}"이(가) 이미 존재합니다. 다른 이름을 사용해주세요.`);
          return;
        }

        // 변수 이름 변경
        await this.model.renameVariable(type, oldName, newName, value);

        // updateVariableCard를 사용하여 UI 업데이트 처리
        this.view.updateVariableCard(newName, value);

        // 채팅 변수의 경우, 최근 처리 기록에 추가
        if (type === 'chat') {
          // 이전 이름 기록 제거 (존재하는 경우), 새 이름 기록 추가
          this.syncService.markVariableAsProcessed(newName);
        }
      } else {
        // 값만 업데이트
        await this.model.saveVariableData(type, newName, value);

        // updateVariableCard를 사용하여 UI 업데이트 처리
        this.view.updateVariableCard(newName, value);

        // 채팅 변수의 경우, 최근 처리 기록에 추가
        if (type === 'chat') {
          this.syncService.markVariableAsProcessed(newName);
        }
      }

      // 카드 애니메이션 완료 후 내부 작업 플래그 종료 확인 (특히 채팅 변수)
      // 이를 통해 폴링이 내부 작업으로 인식할 시간을 더 확보하여 중복 카드 추가 방지
      if (type === 'chat') {
        setTimeout(() => {
          this.model.endInternalOperation();
        }, 2100); // 애니메이션 시간 및 폴링 간격보다 약간 김
      } else {
        this.model.endInternalOperation();
      }
    } catch (error: any) {
      console.error(`[VariableManager] 변수 저장 실패:`, error);
      toastr.error(`변수 저장 중 오류 발생: ${error.message || '알 수 없는 오류'}`);
      this.model.endInternalOperation();
    }
  }

  /**
   * 모든 변수 제거 처리
   */
  private async handleClearAll(): Promise<void> {
    const type = this.model.getActiveVariableType();

    this.view.showConfirmDialog(
      `모든 ${this.getVariableTypeName(type)} 변수를 제거하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      async confirmed => {
        if (confirmed) {
          try {
            this.model.beginInternalOperation();
            await this.model.clearAllVariables(type);

            // 컨테이너 가져오기
            const container = this.view.getContainer().find(`#${type}-content .variables-container`);
            const floorContainer = this.view.getContainer().find(`#${type}-content .floor-variables-container`);

            // 먼저 페이드 아웃 효과 추가
            container.css({
              transition: 'all 0.5s ease',
              opacity: '0.2',
            });
            floorContainer.css({
              transition: 'all 0.5s ease',
              opacity: '0.2',
            });

            // 애니메이션 완료 후 DOM을 직접 비우는 대신 새로고침 메커니즘을 사용하여 UI 업데이트
            setTimeout(() => {
              // 기존 새로고침 메커니즘을 사용하여 UI와 데이터 일관성 보장
              this.refreshVariableCards();

              // 컨테이너 투명도 복원
              container.css({ opacity: '1' });
              floorContainer.css({ opacity: '1' });

              // 전역 작업이므로 성공 알림 유지
              toastr.success(`모든 ${this.getVariableTypeName(type)} 변수를 제거했습니다.`);
            }, 500);
          } catch (error: any) {
            console.error(`[VariableManager] ${type} 변수 제거 실패:`, error);
            toastr.error(`${this.getVariableTypeName(type)} 변수 제거 중 오류 발생: ${error.message || '알 수 없는 오류'}`);
          } finally {
            this.model.endInternalOperation();
          }
        }
      },
    );
  }

  /**
   * 필터 아이콘 클릭 처리
   */
  private handleFilterIconClick(): void {
    const $filterOptions = this.view.getContainer().find('.filter-options');
    $filterOptions.toggle();
  }

  /**
   * 필터 옵션 변경 처리
   * @param event 변경 이벤트
   */
  private handleFilterOptionChange(event: JQuery.ChangeEvent): void {
    const $checkbox = $(event.currentTarget);
    const type = $checkbox.data('type') as VariableDataType;
    const isChecked = $checkbox.is(':checked');

    this.model.updateFilterState(type, isChecked);
    this.refreshVariableCards();
  }

  /**
   * 변수 검색 처리
   * @param event 입력 이벤트
   */
  private handleVariableSearch(event: JQuery.TriggeredEvent): void {
    const keyword = $(event.currentTarget).val() as string;
    this.model.updateSearchKeyword(keyword);
    this.refreshVariableCards();
  }

  /**
   * 층 범위 필터 처리
   */
  private handleFloorRangeFilter(): void {
    const $minInput = this.view.getContainer().find('#floor-min');
    const $maxInput = this.view.getContainer().find('#floor-max');

    const minVal = $minInput.val() as string;
    const maxVal = $maxInput.val() as string;

    const min = minVal ? parseInt(minVal) : null;
    const max = maxVal ? parseInt(maxVal) : null;

    if ((min !== null && isNaN(min)) || (max !== null && isNaN(max))) {
      this.view.showFloorFilterError('유효한 숫자를 입력해주세요');
      return;
    }

    if (min !== null && max !== null && min > max) {
      this.view.showFloorFilterError('최소값은 최대값보다 클 수 없습니다');
      return;
    }

    this.view.hideFloorFilterError();

    if (min !== null || max !== null) {
      this.applyFloorRangeAndReload(min || 0, max === null ? Infinity : max);
    }
  }

  /**
   * 층 범위 적용 및 변수 다시 로드
   * @param min 최소 층
   * @param max 최대 층
   */
  private async applyFloorRangeAndReload(min: number, max: number): Promise<void> {
    try {
      this.model.beginInternalOperation();

      // 모델의 층 범위 업데이트
      this.model.updateFloorRange(min, max);

      // 입력 필드 표시 값 업데이트
      this.view.updateFloorRangeInputs(min, max);

      // 메시지 변수 다시 로드
      await this.loadVariables('message');
    } catch (error: any) {
      console.error(`[VariableManager] 층 범위 적용 및 변수 다시 로드 실패:`, error);
    } finally {
      this.model.endInternalOperation();
    }
  }

  /**
   * 리소스 정리
   */
  public cleanup(): void {
    try {
      this.model.resetInternalOperationState();

      this.syncService.cleanup();
    } catch (error) {
      console.error(`[VariableManager] 리소스 정리 실패:`, error);
    }
  }

  /**
   * 변수 타입의 한국어 이름 가져오기
   * @param type 변수 타입
   * @returns 한국어 이름
   */
  private getVariableTypeName(type: VariableType): string {
    switch (type) {
      case 'global':
        return '전역';
      case 'character':
        return '캐릭터';
      case 'chat':
        return '채팅';
      case 'message':
        return '메시지';
      default:
        return type;
    }
  }
}