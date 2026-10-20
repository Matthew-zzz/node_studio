import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/ui/brand";
import { AnimatedIllustration } from "@/features/services/components/animated-illustration";

export function ProductArt() {
  return (
    <AnimatedIllustration className="ability-art product-art" aria-label="Пример собственного продукта: сайт с личным кабинетом и приложением в Telegram." role="img">
      <div className="product-browser">
        <div className="product-browser-bar">
          <span className="product-window-dots">
            <i />
            <i />
            <i />
          </span>
          <span>
            {"Ваш продукт"}
          </span>
          <span>
            <Icon name="site" className="" strokeWidth={1.5} />
          </span>
        </div>
        <div className="product-browser-body">
          <div className="product-example-sidebar">
            <span className="ability-brand-mark" aria-hidden="true">
              <BrandMark />
            </span>
            <span className="product-sidebar-active">
              {"Обзор"}
            </span>
            <span>
              {"Клиенты"}
            </span>
            <span>
              {"Заявки"}
            </span>
            <span>
              {"Настройки"}
            </span>
          </div>
          <div className="product-example-main">
            <div className="product-example-heading">
              <strong>
                {"Личный кабинет"}
              </strong>
              <span>
                <Icon name="people" className="" strokeWidth={1.5} />
              </span>
            </div>
            <div className="product-example-tabs">
              <span>
                {"Заявки"}
              </span>
              <span>
                {"История"}
              </span>
            </div>
            <div className="product-example-row">
              <span className="product-row-icon">
                <Icon name="document" className="" strokeWidth={1.5} />
              </span>
              <span>
                {"Запрос на расчёт"}
              </span>
              <span className="product-row-state state-0">
                {"Новое"}
              </span>
            </div>
            <div className="product-example-row">
              <span className="product-row-icon">
                <Icon name="document" className="" strokeWidth={1.5} />
              </span>
              <span>
                {"Обратная связь"}
              </span>
              <span className="product-row-state state-1">
                {"В работе"}
              </span>
            </div>
            <div className="product-example-row">
              <span className="product-row-icon">
                <Icon name="check" className="" strokeWidth={1.5} />
              </span>
              <span>
                {"Вопрос по услуге"}
              </span>
              <span className="product-row-state state-2">
                {"Готово"}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="product-example-phone">
        <div className="product-phone-camera" />
        <div className="product-phone-heading">
          <Icon name="telegram" className="" strokeWidth={1.5} />
          <strong>
            {"Ваш бот"}
          </strong>
        </div>
        <div className="product-chat incoming">
          {"Чем помочь?"}
        </div>
        <div className="product-chat outgoing">
          {"Оставить заявку"}
        </div>
        <div className="product-chat incoming">
          {"Расскажите о задаче"}
        </div>
        <div className="product-phone-input">
          <span>
            {"Сообщение"}
          </span>
          <Icon name="telegram" className="" strokeWidth={1.5} />
        </div>
        <span className="product-phone-home" />
      </div>
    </AnimatedIllustration>
  );
}
