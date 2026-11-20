// Filtro simples de texto enviado por usuários (comentários, legendas, avisos).
// Apple e Google exigem que apps com conteúdo de usuários tenham filtro + denúncia + bloqueio.
// A denúncia e o bloqueio estão em social.jsx; aqui fica a validação antes de enviar.

// Adicione aqui termos que você quer barrar (em minúsculas, sem acento é opcional).
export const PALAVRAS_BLOQUEADAS = [];

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Devolve a mensagem de erro (string) ou null se o texto estiver ok. */
export function validarTexto(texto, { max = 500, obrigatorio = true } = {}) {
  const s = String(texto ?? '').trim();
  if (!s) return obrigatorio ? 'Escreva algo antes de enviar.' : null;
  if (s.length > max) return `Máximo de ${max} caracteres.`;
  if ((s.match(/https?:\/\/|www\./gi) || []).length > 1) return 'Muitos links no texto. Remova alguns.';
  if (/(.)\1{9,}/.test(s)) return 'O texto tem caracteres repetidos demais.';
  const base = semAcento(s);
  if (PALAVRAS_BLOQUEADAS.some((p) => base.includes(semAcento(p)))) return 'Esse texto contém termos não permitidos.';
  return null;
}
