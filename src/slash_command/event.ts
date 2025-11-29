import { eventSource } from '@sillytavern/script';
import { SlashCommand } from '@sillytavern/scripts/slash-commands/SlashCommand';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '@sillytavern/scripts/slash-commands/SlashCommandArgument';
import { SlashCommandParser } from '@sillytavern/scripts/slash-commands/SlashCommandParser';

export async function slashEventEmit(named_args: any): Promise<any> {
  const event: string = named_args.event;
  const data: string[] = named_args.data ?? [];

  eventSource.emit(event, ...data);

  console.info(`[Event][/event-emit] '${event}' 이벤트 전송, 포함된 데이터: ${JSON.stringify(data)}`);

  return event;
}

export function initSlashEventEmit() {
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'event-emit',
      callback: slashEventEmit,
      returns: '전송된 이벤트 이름',
      namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
          name: 'event',
          description: '이벤트 이름',
          typeList: [ARGUMENT_TYPE.STRING],
          isRequired: true,
        }),
        SlashCommandNamedArgument.fromProps({
          name: 'data',
          description: '전송할 데이터',
          typeList: [ARGUMENT_TYPE.STRING],
          isRequired: false,
          acceptsMultiple: true,
        }),
      ],
      unnamedArgumentList: [],
      helpString: `
    <div>
        \`event\` 이벤트를 전송하고, 동시에 일부 데이터를 보낼 수 있습니다.
        이 메시지 채널을 수신 대기 중인 모든 리스너 함수는 자동으로 실행되며, 함수 매개변수를 통해 전송된 데이터를 수신할 수 있습니다.
        Tavern STScript 입력 방식의 한계로 인해 모든 데이터는 문자열(string) 타입으로 수신됩니다. number 등 다른 타입이 필요한 경우 직접 변환하십시오.
    </div>
    <div>
        <strong>Example:</strong>
        <ul>
            <li>
                <pre><code class="language-stscript">/event-emit event="불러오기"</code></pre>
            </li>
            <li>
                <pre><code class="language-stscript">/event-emit event="저장하기" data={{getvar::데이터}} data=8 data=안녕 {{user}}</code></pre>
            </li>
            <li>
                <pre><code class="language-stscript">/event-emit event="임의의_이벤트명" data="이것은 데이터" data={{user}}</code></pre>
            </li>
        </ul>
    </div>
  `,
    }),
  );
}