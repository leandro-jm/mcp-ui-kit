export type Locale = 'en' | 'pt-BR' | 'es';

const en = {
  noData: 'No data.',
  showChart: 'Chart',
  showTable: 'Table',
  submit: 'Submit',
  cancel: 'Cancel',
  confirm: 'Confirm',
  running: 'Running…',
  discarded: 'Discarded. Nothing was sent.',
  notExecuted: 'Nothing was executed.',
  done: 'Done',
  failed: 'The call failed.',
  required: 'Required field.',
  select: 'Select…',
  number: 'Enter a number.',
  integer: 'Enter a whole number.',
  min: 'Minimum {n}.',
  max: 'Maximum {n}.',
  minLength: 'Use at least {n} characters.',
  maxLength: 'Use at most {n} characters.',
  email: 'Invalid e-mail.',
  pattern: 'Invalid format.',
  invalid: 'Invalid value.',
  truncated: 'Partial result: the response was cut to fit.',
  irreversible: 'irreversible',
  effectRead: 'read',
  effectWrite: 'write',
  effectExternal: 'external',
  effectNotify: 'notification',
  yes: 'Yes',
  no: 'No',
  unsupported: 'This view is not available here.',
  rows: '{n} rows',
};

export type MessageKey = keyof typeof en;

const ptBR: Record<MessageKey, string> = {
  noData: 'Sem dados.',
  showChart: 'Gráfico',
  showTable: 'Tabela',
  submit: 'Enviar',
  cancel: 'Cancelar',
  confirm: 'Confirmar',
  running: 'Executando…',
  discarded: 'Descartado. Nada foi enviado.',
  notExecuted: 'Nada foi executado.',
  done: 'Concluído',
  failed: 'A chamada falhou.',
  required: 'Campo obrigatório.',
  select: 'Selecione…',
  number: 'Informe um número.',
  integer: 'Informe um número inteiro.',
  min: 'Mínimo {n}.',
  max: 'Máximo {n}.',
  minLength: 'Use ao menos {n} caracteres.',
  maxLength: 'Use no máximo {n} caracteres.',
  email: 'E-mail inválido.',
  pattern: 'Formato inválido.',
  invalid: 'Valor inválido.',
  truncated: 'Resultado parcial: a resposta foi cortada para caber.',
  irreversible: 'irreversível',
  effectRead: 'leitura',
  effectWrite: 'escrita',
  effectExternal: 'externo',
  effectNotify: 'notificação',
  yes: 'Sim',
  no: 'Não',
  unsupported: 'Esta visualização não está disponível aqui.',
  rows: '{n} linhas',
};

const es: Record<MessageKey, string> = {
  noData: 'Sin datos.',
  showChart: 'Gráfico',
  showTable: 'Tabla',
  submit: 'Enviar',
  cancel: 'Cancelar',
  confirm: 'Confirmar',
  running: 'Ejecutando…',
  discarded: 'Descartado. No se envió nada.',
  notExecuted: 'No se ejecutó nada.',
  done: 'Listo',
  failed: 'La llamada falló.',
  required: 'Campo obligatorio.',
  select: 'Seleccione…',
  number: 'Ingrese un número.',
  integer: 'Ingrese un número entero.',
  min: 'Mínimo {n}.',
  max: 'Máximo {n}.',
  minLength: 'Use al menos {n} caracteres.',
  maxLength: 'Use como máximo {n} caracteres.',
  email: 'Correo inválido.',
  pattern: 'Formato inválido.',
  invalid: 'Valor inválido.',
  truncated: 'Resultado parcial: la respuesta se recortó para caber.',
  irreversible: 'irreversible',
  effectRead: 'lectura',
  effectWrite: 'escritura',
  effectExternal: 'externo',
  effectNotify: 'notificación',
  yes: 'Sí',
  no: 'No',
  unsupported: 'Esta vista no está disponible aquí.',
  rows: '{n} filas',
};

const CATALOG: Record<Locale, Record<MessageKey, string>> = { en, 'pt-BR': ptBR, es };

/** Closest supported locale (`pt`, `pt-PT` → `pt-BR`; `es-AR` → `es`; anything else → `en`). */
export function toLocale(tag: string | undefined): Locale {
  const t = (tag ?? '').toLowerCase();
  if (t.startsWith('pt')) return 'pt-BR';
  if (t.startsWith('es')) return 'es';
  return 'en';
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function translator(locale: Locale): Translate {
  return (key, params) => CATALOG[locale][key].replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''));
}
