import {
  getCurrentVersion,
  updateTavernHelper as updateTavernHelperImpl,
  VERSION_FILE_PATH,
} from '@/util/check_update';

export async function getTavernHelperVersion(): Promise<string> {
  const currentVersion = await getCurrentVersion(VERSION_FILE_PATH);
  if (typeof currentVersion !== 'string') {
    throw new Error('가져온 버전 번호가 유효하지 않습니다.');
  }
  return currentVersion;
}

export async function updateTavernHelper() {
  return updateTavernHelperImpl();
}
