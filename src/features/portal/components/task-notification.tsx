import styles from "./task-proposals.module.css";

export function TaskNotification({ count }: { count: number }) {
  if (!count) return null;
  return <span className={styles.notification} aria-label={`Ждут решения: ${count}`} title={`Ждут решения: ${count}`}><span aria-hidden="true">{count > 99 ? "99+" : count}</span></span>;
}
