import Image from "next/image";

const scenes = [
  {
    number: "01",
    eyebrow: "Магазин и каталог",
    title: "Нужная деталь находится быстрее.",
    description: "Каталог, полки магазина и рабочее место продавца объединены в одну понятную историю.",
    image: "/assets/motorika/store-interior.webp",
    alt: "Светлый современный автомагазин с каталогом запчастей и стойкой обслуживания",
    className: "motorika-scene-wide",
  },
  {
    number: "02",
    eyebrow: "Ассортимент и остатки",
    title: "Видно, что есть в наличии.",
    description: "Фильтры, тормозные диски и другие позиции собраны в наглядную витрину. В интерфейсе проекта остатки связаны с подбором деталей.",
    image: "/assets/motorika/parts-showcase.webp",
    alt: "Стеллаж автомагазина с тормозными дисками, фильтрами и деталями",
    className: "motorika-scene-parts",
  },
  {
    number: "03",
    eyebrow: "Подбор аналога",
    title: "Сверить варианты — за одним столом.",
    description: "Сотрудник сравнивает оригинальную деталь и замену, а система помогает проверить подходящие позиции по базе магазина.",
    image: "/assets/motorika/selection-counter.webp",
    alt: "Сотрудник автомагазина сравнивает две автомобильные детали у стойки",
    className: "motorika-scene-selection",
  },
] as const;

export function AutopartsBrandStory() {
  return (
    <section className="motorika-story container" aria-label="Визуальная концепция автомагазина Моторика">
      <div className="motorika-brand reveal">
        <Image src="/assets/motorika-logo.svg" alt="Моторика" width={560} height={144} priority />
        <div>
          <p className="motorika-kicker">Концепция бренда для презентации</p>
          <p className="motorika-brand-copy">Автозапчасти, каталог и склад — в одном месте.</p>
        </div>
      </div>
      {scenes.map((scene) => (
        <article className={`motorika-scene ${scene.className} reveal`} key={scene.number}>
          <div className="motorika-scene-image">
            <Image src={scene.image} alt={scene.alt} width={1672} height={941} sizes="(max-width: 760px) 100vw, 1200px" />
          </div>
          <div className="motorika-scene-copy">
            <span>
              {scene.number}
              {" / "}
              {scene.eyebrow}
            </span>
            <h2>{scene.title}</h2>
            <p>{scene.description}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
