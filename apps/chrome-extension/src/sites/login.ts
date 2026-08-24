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
  readonly workSelector: string;
}

export const LOGIN_SITES = [
  {
    role: 'source',
    loginUrl: 'https://www.ahgora.com.br/externo/index/a128879',
    destinationUrl: 'https://app.ahgora.com.br/externo/mirror',
    formSelector: '#boxLogin',
    usernameSelector: '[name="matricula"]',
    passwordSelector: '[name="senha"]',
    workSelector: '#mirror',
  },
  {
    role: 'target',
    loginUrl: 'https://channel.certi.org.br/channel/login.do',
    destinationUrl:
      'https://channel.certi.org.br/channel/apontamento.do?action=listarDatas&retorno=painel',
    formSelector: '#loginForm',
    usernameSelector: '[name="username"]',
    passwordSelector: '[name="password"]',
    workSelector: '#totalItensPagina',
  },
] as const satisfies readonly LoginSiteDefinition[];

export type LoginSubmitResult =
  'submitted' | 'already-authenticated' | 'not-filled';

export interface LoginDocumentProbe {
  readonly ready: boolean;
  readonly formPresent: boolean;
  readonly formVisible: boolean;
  readonly workMarkerPresent: boolean;
  readonly pathname: string;
}

/** Executada no MAIN world; distingue formulário existente de formulário visível. */
export function probeLoginDocument(
  formSelector: string,
  workSelector?: string,
): LoginDocumentProbe {
  const form = document.querySelector<HTMLElement>(formSelector);
  let formVisible = form !== null;
  for (let element = form; element; element = element.parentElement) {
    const style = globalThis.getComputedStyle(element);
    if (
      element.hidden ||
      element.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    ) {
      formVisible = false;
      break;
    }
  }
  return {
    ready: document.readyState !== 'loading',
    formPresent: form !== null,
    formVisible,
    workMarkerPresent:
      workSelector !== undefined &&
      document.querySelector(workSelector) !== null,
    pathname: globalThis.location.pathname,
  };
}

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
  const isVisible = (element: HTMLElement): boolean => {
    for (let current: HTMLElement | null = element; current;) {
      const style = globalThis.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute('aria-hidden') === 'true' ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.opacity === '0'
      )
        return false;
      current = current.parentElement;
    }
    return true;
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
      if (!isVisible(form) && document.readyState !== 'loading')
        return 'already-authenticated';
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
