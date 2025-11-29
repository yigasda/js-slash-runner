import { getRequestHeaders } from '@sillytavern/script';
import { extensionTypes } from '@sillytavern/scripts/extensions';
import { t } from '@sillytavern/scripts/i18n';
import { POPUP_TYPE, callGenericPopup } from '@sillytavern/scripts/popup';
import { extensionFolderPath, extensionName } from './extension_variables';
import { renderMarkdown } from './render_markdown';

const GITLAB_INSTANCE_URL = 'gitlab.com';
const GITLAB_PROJECT_PATH = 'novi028/JS-Slash-Runner';
const GITLAB_BRANCH = 'main';
const VERSION_FILE_PATH_GITLAB = 'manifest.json';
const CHANGELOG_FILE_PATH_GITLAB = 'CHANGELOG.md';
export const VERSION_FILE_PATH = `/scripts/extensions/${extensionFolderPath}/manifest.json`;
let CURRENT_VERSION: string;
let LATEST_VERSION: string;
let CHANGELOG_CONTENT: string;

/**
 * GitLab 저장소에서 지정된 파일의 원본 내용을 가져옵니다 (프로젝트 ID 또는 프로젝트 경로 지원).
 * @param filePath 저장소 내 파일 경로 (자동으로 URL 인코딩됨)
 * @returns 파일 내용을 담은 Promise<string>를 반환합니다.
 */
async function fetchRawFileContentFromGitLab(filePath: string): Promise<string> {
  const idOrPathForUrl =
    typeof GITLAB_PROJECT_PATH === 'string' && GITLAB_PROJECT_PATH.includes('/')
      ? encodeURIComponent(GITLAB_PROJECT_PATH)
      : GITLAB_PROJECT_PATH;
  const encodedFilePath = encodeURIComponent(filePath);
  const url = `https://${GITLAB_INSTANCE_URL}/api/v4/projects/${idOrPathForUrl}/repository/files/${encodedFilePath}/raw?ref=${GITLAB_BRANCH}`;

  const headers: HeadersInit = {
    'Cache-Control': 'no-cache',
  };

  try {
    const response = await fetch(url, { method: 'GET', headers: headers });
    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        /* ignore */
      }
      throw new Error(
        `[TavernHelper] GitLab 파일을 가져올 수 없습니다: ${response.status} ${response.statusText}. URL: ${url}. Response: ${errorBody}`,
      );
    }
    const content = await response.text();
    return content.trim();
  } catch (error) {
    console.error('[TavernHelper] GitLab 파일 내용을 가져오는 중 오류 발생:', error);
    throw error;
  }
}

/**
 * JSON 파일 내용에서 'version' 필드 값을 파싱합니다.
 * @param content 파일 내용 문자열
 * @returns 파싱된 버전 번호 문자열 (예: "2.5.5")
 * @throws 내용이 유효한 JSON이 아니거나 'version' 필드가 없거나 문자열이 아니면 오류를 발생시킵니다.
 */
export function parseVersionFromFile(content: string): string {
  try {
    const data = JSON.parse(content);

    if (data && typeof data.version === 'string') {
      return data.version;
    } else {
      throw new Error("[TavernHelper] JSON 데이터에서 유효한 'version' 필드를 찾을 수 없습니다 (문자열 타입이어야 합니다)");
    }
  } catch (error) {
    console.error('[TavernHelper] 버전 파일 내용을 파싱하는 중 오류 발생:', error);

    if (error instanceof SyntaxError) {
      throw new Error(`[TavernHelper] 파일 내용을 JSON으로 파싱할 수 없습니다: ${error.message}`);
    }

    throw new Error(
      `[TavernHelper] 파일 내용에서 버전 번호를 파싱할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * 현재 버전 번호 가져오기
 * @param path 버전 번호 파일 경로
 * @returns 현재 버전 번호
 */
export async function getCurrentVersion(path: string) {
  CURRENT_VERSION = parseVersionFromFile(await getFileContentByPath(path));
  return CURRENT_VERSION;
}

/**
 * 두 개의 시맨틱 버전 번호(Semantic Versioning - Major.Minor.Patch)를 비교합니다.
 * @param versionA 버전 번호 문자열 A (예: "2.5.5")
 * @param versionB 버전 번호 문자열 B (예: "1.0.0")
 * @returns
 * - 양수 (> 0): versionA > versionB (A가 더 최신)
 * - 음수 (< 0): versionA < versionB (B가 더 최신)
 * - 0:        versionA == versionB (버전 동일)
 * 참고: 이 기본 비교기는 사전 릴리스 태그(-beta) 또는 빌드 메타데이터(+build)를 처리하지 않습니다.
 * 이 비교에서는 "2.5.5-beta"와 "2.5.5"를 동일하게 간주합니다.
 */
function compareSemVer(versionA: string, versionB: string): number {
  const cleanVersionA = versionA.split('-')[0].split('+')[0];
  const cleanVersionB = versionB.split('-')[0].split('+')[0];

  const partsA = cleanVersionA.split('.').map(Number);
  const partsB = cleanVersionB.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    // 특정 버전 번호 부분이 누락된 경우 (예: "1.2" vs "1.2.3"), 0으로 간주합니다.
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (isNaN(numA) || isNaN(numB)) {
      console.warn(`[TavernHelper] 버전 번호 "${versionA}" 또는 "${versionB}"에 숫자가 아닌 부분이 포함되어 있어 비교가 정확하지 않을 수 있습니다.`);
      return 0;
    }

    if (numA > numB) {
      return 1;
    }
    if (numA < numB) {
      return -1;
    }
  }

  return 0;
}

export async function getFileContentByPath(filePath: string) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const content = await response.text();
    return content;
  } catch (error) {
    console.error(`파일 ${filePath} 읽기 실패:`, error);
    throw error;
  }
}

export async function runCheckWithPath() {
  try {
    LATEST_VERSION = parseVersionFromFile(await fetchRawFileContentFromGitLab(VERSION_FILE_PATH_GITLAB));

    const comparisonResult = compareSemVer(LATEST_VERSION, CURRENT_VERSION);

    if (comparisonResult > 0) {
      console.info(`[TavernHelper] 업데이트 필요! 최신 버전 ${LATEST_VERSION} > 현재 버전 ${CURRENT_VERSION}`);
      return true;
    } else if (comparisonResult === 0) {
      console.info(`[TavernHelper] 현재 버전 ${CURRENT_VERSION}은(는) 이미 최신입니다.`);
      return false;
    } else {
      console.warn(`[TavernHelper] 현재 버전 ${CURRENT_VERSION}이(가) 원격 버전 ${LATEST_VERSION}보다 새롭습니까?`);
      return false;
    }
  } catch (error) {
    console.error('[TavernHelper] 버전 확인 실패:', error);
    return false;
  }
}

/**
 * 버전 업데이트 알림 요소 추가
 */
export function addVersionUpdateElement() {
  const container = $('#tavern-helper-extension-container .inline-drawer-header b');
  container.append(`
    <span style="color: red; font-size: 12px; font-weight: bold;">
      New!
    </span>
  `);
  $('#version-update-text').closest('.flex-container .alignItemsCenter').append(`
      <div style='background-color: var(--SmartThemeQuoteColor);border-radius: 50px;padding: 0 5px;height: 50%; font-size: calc(var(--mainFontSize) * 0.7);'>
        최신：Ver ${LATEST_VERSION}
      </div>
    `);
}

/**
 * 변경 로그 내용을 파싱하여 두 버전 간의 로그를 추출합니다.
 * @param changelogContent 변경 로그 전체 내용
 * @param currentVersion 현재 버전 번호
 * @param latestVersion 최신 버전 번호
 * @returns 두 버전 간의 로그 내용
 */
export function parseChangelogBetweenVersions(
  changelogContent: string,
  currentVersion: string,
  latestVersion: string,
): string | undefined {
  // 모든 버전 제목을 찾고 다양한 Markdown 제목 형식을 지원합니다.
  // ## 버전 번호 또는 # 버전 번호 또는 [버전 번호] 등 형식과 일치시킵니다.
  const versionRegex = /(?:^|\n)(?:#{1,3}\s*|\[)([0-9]+\.[0-9]+\.[0-9]+)(?:\]|\s|$)/g;
  const matches = [...changelogContent.matchAll(versionRegex)];

  if (matches.length === 0) {
    toastr.error('버전 로그를 찾을 수 없습니다.');
    return;
  }

  // 현재 버전과 최신 버전 비교
  const comparisonResult = compareSemVer(latestVersion, currentVersion);
  let extractedContent = '';

  if (comparisonResult <= 0) {
    // 현재 버전이 최신 버전보다 크거나 같으면 최신 버전의 로그만 반환합니다.
    const latestVersionMatch = matches.find(match => match[1] === latestVersion);
    if (!latestVersionMatch) {
      toastr.error('업데이트 로그 가져오기 실패');
      return;
    }

    const startIndex = latestVersionMatch.index;
    const nextVersionMatch = matches.find(match => match.index > startIndex);
    const endIndex = nextVersionMatch ? nextVersionMatch.index : changelogContent.length;

    extractedContent = changelogContent.substring(startIndex, endIndex).trim();
  } else {
    const currentVersionMatch = matches.find(match => match[1] === currentVersion);
    if (!currentVersionMatch) {
      toastr.error(`버전 ${currentVersion}의 로그를 찾을 수 없습니다.`);
      return;
    }

    const latestVersionMatch = matches.find(match => match[1] === latestVersion);
    if (!latestVersionMatch) {
      toastr.error(`버전 ${latestVersion}의 로그를 찾을 수 없습니다.`);
      return;
    }

    const startIndex = currentVersionMatch.index;
    const endIndex = latestVersionMatch.index;

    extractedContent = changelogContent.substring(startIndex, endIndex).trim();
  }

  return renderMarkdown(extractedContent);
}

/**
 * 변경 로그 팝업 표시
 */
export async function handleUpdateButton() {
  if (!CHANGELOG_CONTENT) {
    await getChangelog();
  }
  const result = await callGenericPopup(CHANGELOG_CONTENT, POPUP_TYPE.CONFIRM, '', {
    okButton: '업데이트',
    cancelButton: '취소',
  });
  if (result) {
    toastr.info('업데이트 중……');
    await updateTavernHelper();
  }
}

/**
 * 변경 로그 가져오기
 * @returns 두 버전 간의 로그 내용
 */
export async function getChangelog() {
  toastr.info('업데이트 로그 가져오는 중……');
  const changelogContent = await fetchRawFileContentFromGitLab(CHANGELOG_FILE_PATH_GITLAB);
  if (LATEST_VERSION === undefined) {
    LATEST_VERSION = parseVersionFromFile(await fetchRawFileContentFromGitLab(VERSION_FILE_PATH_GITLAB));
  }

  if (CURRENT_VERSION === undefined) {
    CURRENT_VERSION = parseVersionFromFile(await getFileContentByPath(VERSION_FILE_PATH));
  }

  const logs = parseChangelogBetweenVersions(changelogContent, CURRENT_VERSION, LATEST_VERSION);
  if (!logs) {
    toastr.error('업데이트 로그를 가져올 수 없습니다.');
    return;
  } else {
    CHANGELOG_CONTENT = logs;
  }
}

/**
 * 태번 도우미 업데이트
 */
export async function updateTavernHelper() {
  const extensionType = getExtensionType(extensionName);
  const response = await fetch('/api/extensions/update', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ extensionName: extensionName, global: extensionType === 'global' ? true : false }),
  });
  if (!response.ok) {
    const text = await response.text();
    toastr.error(text || response.statusText, t`태번 도우미 업데이트 실패`, { timeOut: 5000 });
    console.error(`태번 도우미 업데이트 실패: ${text}`);
    return false;
  }

  const data = await response.json();
  if (data.isUpToDate) {
    console.info(`태번 도우미가 이미 최신 버전이므로 업데이트할 필요가 없습니다.`);
  } else {
    toastr.success(t`태번 도우미를 ${data.shortCommitHash}(으)로 성공적으로 업데이트했습니다. 적용하려면 페이지를 새로고침합니다...`);
    console.info(`태번 도우미를 ${data.shortCommitHash}(으)로 성공적으로 업데이트했습니다. 적용하려면 페이지를 새로고침합니다...`);
    setTimeout(() => location.reload(), 3000);
  }
  return true;
}

// Tavern 원본 코드에서 복사됨
/**
 * Gets the type of an extension based on its external ID.
 * @param {string} externalId External ID of the extension (excluding or including the leading 'third-party/')
 * @returns {string} Type of the extension (global, local, system, or empty string if not found)
 */
function getExtensionType(externalId: string) {
  const id = Object.keys(extensionTypes).find(
    // eslint-disable-next-line no-shadow
    (id: string) => id === externalId || (id.startsWith('third-party') && id.endsWith(externalId)),
  );
  return id ? extensionTypes[id] : 'local';
}

// 이전 버전 업데이트 후 사용
/**
 *
 */

export async function showNewFeature() {
  let changelogContent = await fetchRawFileContentFromGitLab(CHANGELOG_FILE_PATH_GITLAB);
  changelogContent = changelogContent + '\n\n*프런트엔드 도우미 이전 버전 구성이 지워졌습니다. 확장 설정을 다시 구성하십시오.*';
  const logs = parseChangelogBetweenVersions(changelogContent, '3.0.0', '3.0.0');

  if (logs) {
    const modifiedLogs = logs.replace(/<h2([^>]*)>([^<]*)<\/h2>/g, '<h2$1>태번 도우미 $2</h2>');
    await callGenericPopup(modifiedLogs, POPUP_TYPE.TEXT);
  }
}