import { saveSettingValue } from '@/util/extension_variables';

import { chat_metadata, saveSettingsDebounced } from '@sillytavern/script';
import { saveMetadataDebounced } from '@sillytavern/scripts/extensions';
import { SlashCommand } from '@sillytavern/scripts/slash-commands/SlashCommand';
import {
  ARGUMENT_TYPE,
  SlashCommandArgument,
  SlashCommandNamedArgument,
} from '@sillytavern/scripts/slash-commands/SlashCommandArgument';
import { commonEnumProviders, enumIcons } from '@sillytavern/scripts/slash-commands/SlashCommandCommonEnumsProvider';
import { SlashCommandEnumValue, enumTypes } from '@sillytavern/scripts/slash-commands/SlashCommandEnumValue';
import { SlashCommandParser } from '@sillytavern/scripts/slash-commands/SlashCommandParser';

import {
  list_BGMS,
  list_ambients,
  onAudioEnabledClick,
  playAudio,
  updateAudio,
  updateAudioSelect,
} from '../component/audio';

interface AudioElement extends HTMLElement {
  pause(): void;
}

/**
 * 오디오 재생 모드 전환
 */
export async function audioMode(args: { type: string; mode: string }): Promise<void> {
  const type = args.type.toLowerCase();
  const mode = args.mode.toLowerCase();

  if (!['bgm', 'ambient'].includes(type) || !['repeat', 'random', 'single', 'stop'].includes(mode)) {
    console.warn('WARN: Invalid arguments for /audiomode command');
    return '';
  }

  if (type === 'bgm') {
    saveSettingValue('audio.bgm_mode', mode);
    const iconMap: Record<string, string> = {
      repeat: 'fa-repeat',
      random: 'fa-random',
      single: 'fa-redo-alt',
      stop: 'fa-cancel',
    };
    $('#audio_bgm_mode_icon').removeClass('fa-repeat fa-random fa-redo-alt fa-cancel');
    $('#audio_bgm_mode_icon').addClass(iconMap[mode]);
  } else if (type === 'ambient') {
    saveSettingValue('audio.ambient_mode', mode);
    const iconMap: Record<string, string> = {
      repeat: 'fa-repeat',
      random: 'fa-random',
      single: 'fa-redo-alt',
      stop: 'fa-cancel',
    };
    $('#audio_ambient_mode_icon').removeClass('fa-repeat fa-random fa-redo-alt fa-cancel');
    $('#audio_ambient_mode_icon').addClass(iconMap[mode]);
  }

  saveSettingsDebounced();
  return '';
}

/**
 * 플레이어 스위치 상태 전환
 */
export async function audioEnable(args: { type: string; state?: string }): Promise<void> {
  const type = args.type.toLowerCase();
  const state = (args.state || 'true').toLowerCase();

  if (!type) {
    console.warn('WARN: Missing arguments for /audioenable command');
    return '';
  }

  if (type === 'bgm') {
    if (state === 'true') {
      $('#enable_bgm').prop('checked', true);
      await onAudioEnabledClick('bgm');
    } else if (state === 'false') {
      $('#enable_bgm').prop('checked', false);
      await onAudioEnabledClick('bgm');
    }
  } else if (type === 'ambient') {
    if (state === 'true') {
      $('#enable_ambient').prop('checked', true);
      await onAudioEnabledClick('ambient');
    } else if (state === 'false') {
      $('#enable_ambient').prop('checked', false);
      await onAudioEnabledClick('ambient');
    }
  }

  return '';
}

/**
 * 재생/일시 정지 상태 전환
 */
export async function audioPlay(args: { type: string; play?: string }): Promise<void> {
  const type = args.type.toLowerCase();
  const play = (args.play || 'true').toLowerCase();

  if (!type) {
    console.warn('WARN: Missing arguments for /audioplaypause command');
    return '';
  }

  if (type === 'bgm') {
    if (play === 'true') {
      await playAudio('bgm');
    } else if (play === 'false') {
      const audioElement = $('#audio_bgm')[0] as AudioElement;
      audioElement.pause();
    }
  } else if (type === 'ambient') {
    if (play === 'true') {
      await playAudio('ambient');
    } else if (play === 'false') {
      const audioElement = $('#audio_ambient')[0] as AudioElement;
      audioElement.pause();
    }
  }

  return '';
}

/**
 * 오디오 링크 가져오기
 */
export async function audioImport(args: { type: string; play?: string }, url: string): Promise<void> {
  const type = args.type.toLowerCase();
  const play = (args.play || 'true').toLowerCase();

  if (!type || !url) {
    console.warn('WARN: Missing arguments for /audioimport command');
    return '';
  }

  const urlArray = url
    .split(',')
    .map((url: string) => url.trim())
    .filter((url: string) => url !== '')
    .filter((url: string, index: number, self: string[]) => self.indexOf(url) === index);
  if (urlArray.length === 0) {
    console.warn('WARN: Invalid or empty URLs provided.');
    return '';
  }

  if (!chat_metadata.variables) {
    chat_metadata.variables = {};
  }

  const typeKey = type === 'bgm' ? 'bgmurl' : 'ambienturl';
  const existingUrls = chat_metadata.variables[typeKey] || [];
  const mergedUrls = [...new Set([...urlArray, ...existingUrls])];

  chat_metadata.variables[typeKey] = mergedUrls;
  saveMetadataDebounced();

  if (type === 'bgm') {
    updateAudioSelect('bgm');
  } else if (type === 'ambient') {
    updateAudioSelect('ambient');
  }

  if (play === 'true' && urlArray[0]) {
    const selectedUrl = urlArray[0];
    if (type === 'bgm') {
      saveSettingValue('audio.bgm_selected', selectedUrl);
      await updateAudio('bgm', true);
    } else if (type === 'ambient') {
      saveSettingValue('audio.ambient_selected', selectedUrl);
      await updateAudio('ambient', true);
    }
  }

  return '';
}

/**
 * 오디오 선택 및 재생
 */
export async function audioSelect(args: { type: string }, url: string): Promise<void> {
  const type = args.type.toLowerCase();

  if (!url) {
    console.warn('WARN: Missing URL for /audioselect command');
    return '';
  }

  if (!chat_metadata.variables) {
    chat_metadata.variables = {};
  }

  const playlist = type === 'bgm' ? list_BGMS : list_ambients;
  const typeKey = type === 'bgm' ? 'bgmurl' : 'ambienturl';

  if (playlist && playlist.includes(url)) {
    if (type === 'bgm') {
      saveSettingValue('audio.bgm_selected', url);
      await updateAudio('bgm', true);
    } else if (type === 'ambient') {
      saveSettingValue('audio.ambient_selected', url);
      await updateAudio('ambient', true);
    }
    return '';
  }

  const existingUrls = chat_metadata.variables[typeKey] || [];

  const mergedUrls = [...new Set([url, ...existingUrls])];
  chat_metadata.variables[typeKey] = mergedUrls;
  saveMetadataDebounced();

  if (type === 'bgm') {
    updateAudioSelect('bgm');
    saveSettingValue('audio.bgm_selected', url);
    await updateAudio('bgm', true);
  } else if (type === 'ambient') {
    updateAudioSelect('ambient');
    saveSettingValue('audio.ambient_selected', url);
    await updateAudio('ambient', true);
  }

  return '';
}

/**
 * 오디오 관련 슬래시 명령어 초기화
 */
export function initAudioSlashCommands() {
  // audioselect 명령어 등록
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'audioselect',
      callback: audioSelect,
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
          name: 'type',
          description: '플레이어 타입 선택 (bgm 또는 ambient)',
          typeList: [ARGUMENT_TYPE.STRING],
          enumList: [
            new SlashCommandEnumValue('bgm', null, enumTypes.enum, enumIcons.file),
            new SlashCommandEnumValue('ambient', null, enumTypes.enum, enumIcons.file),
          ],
          isRequired: true,
        }),
      ],
      unnamedArgumentList: [new SlashCommandArgument('url', [ARGUMENT_TYPE.STRING], true)],
      helpString: `
        <div>
            오디오를 선택하고 재생합니다. 오디오 링크가 존재하지 않으면 먼저 가져온 후 재생합니다.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/audioselect type=bgm https://example.com/song.mp3</code></pre>
                    지정된 음악을 선택하여 재생합니다.
                </li>
                <li>
                    <pre><code>/audioselect type=ambient https://example.com/sound.mp3</code></pre>
                    지정된 음향 효과를 선택하여 재생합니다.
                </li>
            </ul>
        </div>
      `,
    }),
  );

  // audioimport 명령어 등록
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'audioimport',
      callback: audioImport,
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
          name: 'type',
          description: '가져오기 타입 선택 (bgm 또는 ambient)',
          typeList: [ARGUMENT_TYPE.STRING],
          enumList: [
            new SlashCommandEnumValue('bgm', null, enumTypes.enum, enumIcons.file),
            new SlashCommandEnumValue('ambient', null, enumTypes.enum, enumIcons.file),
          ],
          isRequired: true,
        }),
        SlashCommandNamedArgument.fromProps({
          name: 'play',
          description: '가져온 후 첫 번째 링크 즉시 재생 여부',
          typeList: [ARGUMENT_TYPE.BOOLEAN],
          defaultValue: 'true',
          isRequired: false,
        }),
      ],
      unnamedArgumentList: [new SlashCommandArgument('url', [ARGUMENT_TYPE.STRING], true)],
      helpString: `
        <div>
            오디오 또는 음악 링크를 가져오고 즉시 재생할지 여부를 결정합니다. 기본적으로 자동 재생됩니다. 링크를 일괄적으로 가져올 수 있으며, 영어 쉼표를 사용하여 구분합니다.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/audioimport type=bgm https://example.com/song1.mp3,https://example.com/song2.mp3</code></pre>
                    BGM 음악을 가져오고 첫 번째 링크를 즉시 재생합니다.
                </li>
                <li>
                    <pre><code>/audioimport type=ambient play=false url=https://example.com/sound1.mp3,https://example.com/sound2.mp3 </code></pre>
                    음향 효과 링크를 가져옵니다 (자동 재생 안 함).
                </li>
            </ul>
        </div>
      `,
    }),
  );

  // audioplay 명령어 등록
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'audioplay',
      callback: audioPlay,
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
          name: 'type',
          description: '제어할 플레이어 선택 (bgm 또는 ambient)',
          typeList: [ARGUMENT_TYPE.STRING],
          enumList: [
            new SlashCommandEnumValue('bgm', null, enumTypes.enum, enumIcons.file),
            new SlashCommandEnumValue('ambient', null, enumTypes.enum, enumIcons.file),
          ],
          isRequired: true,
        }),
        new SlashCommandNamedArgument(
          'play',
          '재생 또는 일시 정지',
          [ARGUMENT_TYPE.STRING],
          true,
          false,
          'true',
          commonEnumProviders.boolean('trueFalse')(),
        ),
      ],
      helpString: `
        <div>
            음악 플레이어 또는 음향 효과 플레이어의 재생과 일시 정지를 제어합니다.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/audioplay type=bgm</code></pre>
                    현재 음악을 재생합니다.
                </li>
                <li>
                    <pre><code>/audioplay type=ambient play=false</code></pre>
                    현재 음향 효과를 일시 정지합니다.
                </li>
            </ul>
        </div>
      `,
    }),
  );

  // audioenable 명령어 등록
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'audioenable',
      callback: audioEnable,
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
          name: 'type',
          description: '제어할 플레이어 선택 (bgm 또는 ambient)',
          typeList: [ARGUMENT_TYPE.STRING],
          enumList: [
            new SlashCommandEnumValue('bgm', null, enumTypes.enum, enumIcons.file),
            new SlashCommandEnumValue('ambient', null, enumTypes.enum, enumIcons.file),
          ],
          isRequired: true,
        }),
        new SlashCommandNamedArgument(
          'state',
          '플레이어 켜기 또는 끄기',
          [ARGUMENT_TYPE.STRING],
          false,
          false,
          'true',
          commonEnumProviders.boolean('trueFalse')(),
        ),
      ],
      helpString: `
        <div>
            음악 플레이어 또는 음향 효과 플레이어의 켜고 끄기를 제어합니다.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/audioenable type=bgm state=true</code></pre>
                    음악 플레이어를 켭니다.
                </li>
                <li>
                    <pre><code>/audioenable type=ambient state=false</code></pre>
                    음향 효과 플레이어를 끕니다.
                </li>
            </ul>
        </div>
    `,
    }),
  );

  // audiomode 명령어 등록
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'audiomode',
      callback: audioMode,
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
          name: 'type',
          description: '제어할 플레이어 선택 (bgm 또는 ambient)',
          typeList: [ARGUMENT_TYPE.STRING],
          enumList: [
            new SlashCommandEnumValue('bgm', null, enumTypes.enum, enumIcons.file),
            new SlashCommandEnumValue('ambient', null, enumTypes.enum, enumIcons.file),
          ],
          isRequired: true,
        }),
        SlashCommandNamedArgument.fromProps({
          name: 'mode',
          description: '재생 모드 선택',
          typeList: [ARGUMENT_TYPE.STRING],
          enumList: [
            new SlashCommandEnumValue('repeat', null, enumTypes.enum, enumIcons.loop),
            new SlashCommandEnumValue('random', null, enumTypes.enum, enumIcons.shuffle),
            new SlashCommandEnumValue('single', null, enumTypes.enum, enumIcons.redo),
            new SlashCommandEnumValue('stop', null, enumTypes.enum, enumIcons.stop),
          ],
          isRequired: true,
        }),
      ],
      helpString: `
        <div>
            오디오 재생 모드를 설정합니다.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/audiomode type=bgm mode=repeat</code></pre>
                    음악을 반복 재생 모드로 설정합니다.
                </li>
                <li>
                    <pre><code>/audiomode type=ambient mode=random</code></pre>
                    음향 효과를 랜덤 재생 모드로 설정합니다.
                </li>
                <li>
                    <pre><code>/audiomode type=bgm mode=single</code></pre>
                    음악을 한 곡 반복 재생 모드로 설정합니다.
                </li>
                <li>
                    <pre><code>/audiomode type=ambient mode=stop</code></pre>
                    음향 효과를 정지 모드로 설정합니다.
                </li>
            </ul>
        </div>
    `,
    }),
  );
}