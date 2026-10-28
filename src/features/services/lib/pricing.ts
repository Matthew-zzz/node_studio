const rubles = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function formatServicePrice(amount: number): string {
  return `от ${rubles.format(amount)} ₽`;
}

export const servicePricingNote = "Цены указаны для минимального объёма работ и носят ориентировочный характер. Итоговая стоимость зависит от объёма и сложности проекта, количества интеграций и сроков. Состав работ и окончательную цену согласуем в ТЗ и смете до оплаты. Дополнительные работы и изменения согласуем отдельно.";
