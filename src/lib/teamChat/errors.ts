// Erros do Chat da equipe em português. As RPCs devolvem mensagens curtas (ex.: "chat_disabled").

const CODES: Record<string, string> = {
  not_authenticated: 'Sua sessão expirou. Entre novamente para usar o chat.',
  chat_disabled: 'O chat da equipe não está habilitado para esta clínica.',
  invalid_target: 'Escolha outro colega para conversar.',
  target_not_found: 'Esse colega não foi encontrado na sua clínica.',
  invalid_name: 'Dê um nome ao grupo, com até 80 caracteres.',
  group_needs_members: 'Escolha pelo menos um colega para o grupo.',
  too_many_members: 'O grupo tem participantes demais.',
  invalid_member: 'Algum participante escolhido não está mais ativo na clínica.',
  message_not_found: 'Não foi possível alterar a mensagem. Ela pode já ter sido apagada.',
  invalid_body: 'Escreva uma mensagem de 1 a 4.000 caracteres.',
  channel_not_writable: 'Você não pode enviar mensagens nesta conversa.',
  invalid_attachment_kind: 'Este tipo de anexo não é aceito. Envie uma foto ou um áudio.',
  invalid_attachment_mime: 'Este formato de arquivo não é aceito.',
  attachment_too_large: 'O arquivo passa do tamanho permitido.',
  invalid_attachment_size: 'O tamanho do arquivo não é válido.',
  invalid_attachment_duration: 'O áudio precisa ter entre 1 segundo e 5 minutos.',
  invalid_attachment_dimensions: 'As dimensões da foto não são válidas.',
  invalid_attachment_path: 'Não foi possível validar o arquivo enviado. Tente de novo.',
  attachment_not_found: 'O arquivo enviado não foi encontrado. Tente de novo.',
  reply_not_found: 'A mensagem respondida não existe mais.',
  not_a_group: 'Esta conversa não é um grupo.',
  not_group_manager: 'Só quem criou o grupo ou o administrador da clínica pode fazer isso.',
  member_not_found: 'Essa pessoa não está mais no grupo.',
  cannot_remove_self: 'Para sair do grupo, use a opção Sair do grupo.',
  group_full: 'O grupo atingiu o limite de participantes.',
  group_archived: 'Este grupo foi encerrado.',
  not_a_member: 'Você não participa deste grupo.',
  cannot_remove_creator: 'Só um administrador pode remover quem criou o grupo.',
}

function parts(err: unknown): { message: string; code: string } {
  if (typeof err === 'string') return { message: err, code: '' }
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown }
    return { message: typeof e.message === 'string' ? e.message : '', code: typeof e.code === 'string' ? e.code : '' }
  }
  return { message: '', code: '' }
}

/** A tabela ou a função do chat não existe no banco (migração ainda não aplicada). */
export function isChatBackendMissing(err: unknown): boolean {
  const { message, code } = parts(err)
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(code)) return true
  return /could not find the (function|table)|does not exist|schema cache/i.test(message)
}

/** Texto para mostrar ao usuário. `fallback` entra quando o erro não é um dos conhecidos. */
export function teamChatErrorMessage(err: unknown, fallback: string): string {
  const { message, code } = parts(err)
  for (const key of Object.keys(CODES)) {
    if (message.includes(key)) return CODES[key]
  }
  if (isChatBackendMissing(err)) return 'O chat da equipe ainda não está disponível. Tente novamente mais tarde.'
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return 'Você não tem permissão para fazer isso nesta conversa.'
  if (/exceeded the maximum|payload too large|entity too large|too large/i.test(message)) return 'O arquivo passa do tamanho permitido.'
  if (/mime type|not supported|invalid_mime/i.test(message)) return 'Este tipo de arquivo não é aceito.'
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) return 'Sem conexão com a internet. Confira a rede e tente de novo.'
  return fallback
}
