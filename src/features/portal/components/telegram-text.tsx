import { createElement } from "react";
import type { ReactNode } from "react";
import { formatTelegramHtml, parseTelegramHtml } from "@/features/portal/model/telegram-html";
import type { TelegramNode } from "@/features/portal/model/telegram-html";
import styles from "./telegram-text.module.css";
import { DetailDialog } from "@/features/portal/components/focus-dialog";

function renderNodes(nodes: TelegramNode[]): ReactNode {
  return nodes.map((node, index) => "text" in node ? node.text : createElement(node.tag, { key: index, ...(node.tag === "a" ? { href: node.href, target: "_blank", rel: "noopener noreferrer" } : {}) }, renderNodes(node.children)));
}

export function TelegramText({ html, collapsible = false }: { html: string; collapsible?: boolean }) {
  const nodes = parseTelegramHtml(html);
  const content = <div className={styles.rich}>{renderNodes(nodes)}</div>;
  const plain = formatTelegramHtml(html).text;
  if (collapsible && plain.length > 480) return (
    <DetailDialog label={`${plain.slice(0, 90)}… Читать`} title="Сообщение">{content}</DetailDialog>
  );
  return content;
}
