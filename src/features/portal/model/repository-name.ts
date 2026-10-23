export const REPOSITORY_NAME_LIMIT = 100;
export const REPOSITORY_NAME_HELP = "Латинские буквы, цифры, точка, дефис и _. Начните с буквы или цифры, до 100 символов.";
export function validRepositoryName(value: string) { return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value) && !value.toLowerCase().endsWith(".git"); }
export function defaultRepositoryName(projectId: string) { return `node-${projectId.replace(/^project:/, "").replaceAll("-", "")}`; }
