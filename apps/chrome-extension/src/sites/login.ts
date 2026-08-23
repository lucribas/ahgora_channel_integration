export const LOGIN_PERMISSION_ORIGINS = [
  'https://www.ahgora.com.br/*',
  'https://app.ahgora.com.br/*',
  'https://channel.certi.org.br/*',
] as const;

export interface LoginSiteDefinition {
  readonly role: 'source' | 'target';
  readonly loginUrl: string;
  readonly destinationUrl: string;
  readonly formSelector: string;
  readonly usernameSelector: string;
  readonly passwordSelector: string;
}

export const LOGIN_SITES = [
  {
    role: 'source',
    loginUrl: 'https://www.ahgora.com.br/externo/index/a128879',
    destinationUrl: 'https://app.ahgora.com.br/externo/mirror',
    formSelector: '#boxLogin',
    usernameSelector: '[name="matricula"]',
    passwordSelector: '[name="senha"]',
  },
  {
    role: 'target',
    loginUrl: 'https://channel.certi.org.br/channel/login.do',
    destinationUrl:
      'https://channel.certi.org.br/channel/apontamento.do?action=listarDatas&retorno=painel',
    formSelector: '#loginForm',
    usernameSelector: '[name="username"]',
    passwordSelector: '[name="password"]',
  },
] as const satisfies readonly LoginSiteDefinition[];

export type LoginSubmitResult =
  'submitted' | 'already-authenticated' | 'not-filled';

/** Executada na página de login; nunca devolve valores dos campos. */
export async function submitAutofilledLogin(
  input: Pick<
    LoginSiteDefinition,
    'formSelector' | 'usernameSelector' | 'passwordSelector'
  > & {
    readonly timeoutMs?: number;
    readonly loginPathnames?: readonly string[];
  },
): Promise<LoginSubmitResult> {
  const deadline = Date.now() + (input.timeoutMs ?? 10_000);
  let formSeen = false;
  let lastProbe:
    | {
        readonly usernamePresent: boolean;
        readonly passwordPresent: boolean;
        readonly usernameAutofilled: boolean;
        readonly passwordAutofilled: boolean;
      }
    | undefined;
  const hasNativeAutofill = (field: HTMLInputElement | null): boolean => {
    if (!field) return false;
    try {
      return field.matches(':-webkit-autofill');
    } catch {
      return false;
    }
  };
  while (Date.now() <= deadline) {
    const form = document.querySelector<HTMLFormElement>(input.formSelector);
    if (!form) {
      const leftKnownLoginPage =
        input.loginPathnames !== undefined &&
        !input.loginPathnames.includes(globalThis.location.pathname);
      if (leftKnownLoginPage && document.readyState !== 'loading')
        return 'already-authenticated';
      if (document.readyState === 'complete') return 'already-authenticated';
    } else {
      formSeen = true;
      const username = form.querySelector<HTMLInputElement>(
        input.usernameSelector,
      );
      const password = form.querySelector<HTMLInputElement>(
        input.passwordSelector,
      );
      const usernamePresent = Boolean(username?.value.trim());
      const passwordPresent = Boolean(password?.value);
      const usernameAutofilled = hasNativeAutofill(username);
      const passwordAutofilled = hasNativeAutofill(password);
      lastProbe = {
        usernamePresent,
        passwordPresent,
        usernameAutofilled,
        passwordAutofilled,
      };
      if (
        (usernamePresent || usernameAutofilled) &&
        (passwordPresent || passwordAutofilled)
      ) {
        console.info('[AhgoraChannel][LoginAutofillProbe]', {
          status: 'ready-to-submit',
          usernamePresent,
          passwordPresent,
          usernameAutofilled,
          passwordAutofilled,
          pathname: globalThis.location.pathname,
        });
        const submit = form.querySelector<HTMLElement>(
          'button[type="submit"], input[type="submit"]',
        );
        if (submit) submit.click();
        else form.requestSubmit();
        return 'submitted';
      }
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
  }
  console.info('[AhgoraChannel][LoginAutofillProbe]', {
    status: formSeen ? 'fields-not-detected' : 'form-not-detected',
    ...(lastProbe ?? {
      usernamePresent: false,
      passwordPresent: false,
      usernameAutofilled: false,
      passwordAutofilled: false,
    }),
    pathname: globalThis.location.pathname,
  });
  return formSeen ? 'not-filled' : 'already-authenticated';
}
