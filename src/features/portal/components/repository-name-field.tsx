import { useId } from "react";
import { REPOSITORY_NAME_HELP, REPOSITORY_NAME_LIMIT, validRepositoryName } from "@/features/portal/model/repository-name";
import styles from "./portal.module.css";

export function RepositoryNameField({ value, onChange, disabled = false, automatic = true }: { value: string; onChange: (value: string) => void; disabled?: boolean; automatic?: boolean }) {
  const help = useId();
  return (
    <>
      <label>
        Название GitHub-репозитория
        <input
          value={value}
          onChange={event => {
            const name = event.target.value;
            event.target.setCustomValidity(!name.trim() || validRepositoryName(name.trim()) ? "" : REPOSITORY_NAME_HELP);
            onChange(name);
          }}
          maxLength={REPOSITORY_NAME_LIMIT}
          disabled={disabled}
          placeholder="animelove-frontend"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={help}
        />
      </label>
      <p id={help} className={styles.small}>{`${automatic ? "Можно оставить пустым — выберем имя автоматически. " : ""}${REPOSITORY_NAME_HELP}`}</p>
    </>
  );
}
