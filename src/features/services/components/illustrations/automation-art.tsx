import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { AnimatedIllustration } from "@/features/services/components/animated-illustration";

export function AutomationArt() {
  return (
    <AnimatedIllustration className="ability-art automation-art" aria-label="Пример автоматизации: новая заявка сохраняется в базу, после чего сотрудник получает уведомление." role="img">
      <div className="automation-track">
        <div className="automation-step" style={{ "--step": "0" } as CSSProperties}>
          <span>
            <Icon name="trigger" className="" strokeWidth={1.5} />
          </span>
          <strong>
            {"Новая заявка"}
          </strong>
        </div>
        <span className="automation-wire" />
        <div className="automation-step" style={{ "--step": "1" } as CSSProperties}>
          <span>
            <Icon name="database" className="" strokeWidth={1.5} />
          </span>
          <strong>
            {"Запись в базу"}
          </strong>
        </div>
        <span className="automation-wire" />
        <div className="automation-step" style={{ "--step": "2" } as CSSProperties}>
          <span>
            <Icon name="telegram" className="" strokeWidth={1.5} />
          </span>
          <strong>
            {"Уведомление"}
          </strong>
        </div>
      </div>
      <div className="automation-receipt">
        <span>
          <Icon name="check" className="" strokeWidth={1.5} />
        </span>
        <div>
          <strong>
            {"Готово. Вы в курсе."}
          </strong>
          <span>
            {"Без ручных действий."}
          </span>
        </div>
      </div>
    </AnimatedIllustration>
  );
}
