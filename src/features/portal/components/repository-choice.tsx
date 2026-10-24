import { RepositoryNameField } from "@/features/portal/components/repository-name-field";

export type RepositoryMode = "new" | "existing";
export function RepositoryChoice({ mode, onModeChange, name, onNameChange, repo, onRepoChange, disabled, modeLabel = "Репозиторий", existingLabel = "Существующий репозиторий GitHub" }: { mode: RepositoryMode; onModeChange: (mode: RepositoryMode) => void; name: string; onNameChange: (name: string) => void; repo: string; onRepoChange: (repo: string) => void; disabled: boolean; modeLabel?: string; existingLabel?: string }) {
  return (
    <>
      <label>
        Репозиторий
        <select aria-label={modeLabel} value={mode} disabled={disabled} onChange={event => onModeChange(event.target.value as RepositoryMode)}>
          <option value="new">Создать новый</option>
          <option value="existing">Подключить существующий</option>
        </select>
      </label>
      {mode === "new" ? <RepositoryNameField value={name} onChange={onNameChange} disabled={disabled} /> : (
        <>
          <label>
            {existingLabel}
            <input required maxLength={200} value={repo} onChange={event => onRepoChange(event.target.value)} disabled={disabled} placeholder="owner/repository или ссылка GitHub" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
        </>
      )}
    </>
  );
}
