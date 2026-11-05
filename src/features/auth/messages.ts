/** Mensagens de erro de autenticação sem revelar se o e-mail existe. */
export function authErrorMessage(error: { message?: string; status?: number } | null | undefined): string {
  if (!error) return '';
  if (error.status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (error.status === 400 || error.status === 401 || error.status === 422) {
    return 'E-mail ou senha incorretos.';
  }
  return 'Não foi possível concluir agora. Verifique sua conexão e tente de novo.';
}
