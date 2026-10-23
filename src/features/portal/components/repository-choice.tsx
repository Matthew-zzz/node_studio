import { RepositoryNameField } from "@/features/portal/components/repository-name-field";
import styles from "./portal.module.css";

export type RepositoryMode = "new" | "existing";
export function RepositoryChoice({ mode, onModeChange, name, onNameChange, repo, onRepoChange, disabled }: { mode: RepositoryMode; onModeChange: (mode: RepositoryMode) => void; name: string; onNameChange: (name: string) => void; repo: string; onRepoChange: (repo: string) => void; disabled: boolean }) {
  return (
    <>
      <label>
        Репозиторий
        <select aria-label="Репозиторий" value={mode} disabled={disabled} onChange={event => onModeChange(event.target.value as RepositoryMode)}>
          <option value="new">Создать новый</option>
          <option value="existing">Подключить существующий</option>
        </select>
      </label>
      {mode === "new" ? <RepositoryNameField value={name} onChange={onNameChange} disabled={disabled} /> : (
        <>
          <label>
            Существующий репозиторий GitHub
            <input required maxLength={200} value={repo} onChange={event => onRepoChange(event.target.value)} disabled={disabled} placeholder="owner/repository или ссылка GitHub" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <p className={styles.small}>Репозиторий подключённого GitHub-аккаунта с включёнными Issues и правом записи.</p>
        </>
      )}
    </>
  );
}
