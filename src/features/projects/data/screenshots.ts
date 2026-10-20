import type { Screenshot } from "@/features/projects/model/types";

const screenshots: Readonly<Record<string, Screenshot>> = {
  "/assets/autoparts-catalog.jpg": {
    "src": "/assets/concepts/autoparts-catalog-no-images.png",
    "original": "/assets/autoparts-catalog.jpg",
    "width": 1672,
    "height": 941,
    "originalWidth": 1280,
    "originalHeight": 690,
    "enhanced": true,
    "concept": true,
    "mobile": {
      "src": "/assets/mobile/autoparts-catalog.png",
      "width": 941,
      "height": 1672,
      "concept": true,
      "placeholder": false
    }
  },
  "/assets/autoparts-stock.jpg": {
    "src": "/assets/concepts/autoparts-stock.png",
    "original": "/assets/autoparts-stock.jpg",
    "width": 1672,
    "height": 941,
    "originalWidth": 1280,
    "originalHeight": 689,
    "enhanced": true,
    "concept": true,
    "mobile": {
      "src": "/assets/mobile/autoparts-stock.png",
      "width": 941,
      "height": 1672,
      "concept": true,
      "placeholder": false
    }
  },
  "/assets/autoparts-administration.jpg": {
    "src": "/assets/concepts/autoparts-administration.png",
    "original": "/assets/autoparts-administration.jpg",
    "width": 1672,
    "height": 941,
    "originalWidth": 1280,
    "originalHeight": 688,
    "enhanced": true,
    "concept": true,
    "mobile": {
      "src": "/assets/mobile/autoparts-administration.png",
      "width": 941,
      "height": 1672,
      "concept": true,
      "placeholder": false
    }
  },
  "/assets/anime-catalog.jpg": {
    "src": "/assets/prepared/anime-catalog.png",
    "original": "/assets/anime-catalog.jpg",
    "width": 1586,
    "height": 992,
    "originalWidth": 1280,
    "originalHeight": 800,
    "enhanced": true,
    "mobile": {
      "src": "/assets/mobile/anime-catalog.jpg",
      "width": 726,
      "height": 1280,
      "concept": false,
      "placeholder": false
    }
  },
  "/assets/anime-player.jpg": {
    "src": "/assets/prepared/anime-player.png",
    "original": "/assets/anime-player.jpg",
    "width": 1586,
    "height": 992,
    "originalWidth": 1280,
    "originalHeight": 800,
    "enhanced": true
  },
  "/assets/anime-profile.jpg": {
    "src": "/assets/prepared/anime-profile.png",
    "original": "/assets/anime-profile.jpg",
    "width": 1586,
    "height": 992,
    "originalWidth": 1280,
    "originalHeight": 800,
    "enhanced": true,
    "mobile": {
      "src": "/assets/mobile/anime-profile.jpg",
      "width": 724,
      "height": 1280,
      "concept": false,
      "placeholder": false
    }
  },
  "/assets/anime-inventory.jpg": {
    "src": "/assets/prepared/anime-inventory.png",
    "original": "/assets/anime-inventory.jpg",
    "width": 1586,
    "height": 992,
    "originalWidth": 1280,
    "originalHeight": 800,
    "enhanced": true,
    "mobile": {
      "src": "/assets/mobile/anime-inventory.jpg",
      "width": 794,
      "height": 1280,
      "concept": false,
      "placeholder": false
    }
  },
  "/assets/autoparts-analogs.png": {
    "src": "/assets/concepts/autoparts-analogs-no-images.png",
    "original": "/assets/autoparts-analogs.png",
    "width": 1672,
    "height": 941,
    "enhanced": true,
    "concept": true,
    "mobile": {
      "src": "/assets/mobile/autoparts-analogs.png",
      "width": 941,
      "height": 1672,
      "concept": true,
      "placeholder": false
    }
  },
  "/assets/vectra-agents.png": {
    "src": "/assets/mobile/vectra-miniapp-agents.jpg",
    "width": 628,
    "height": 1280,
    "portrait": true,
    "deviceFrame": "iphone",
    "enhanced": false,
    "concept": false
  },
  "/assets/vectra-knowledge.png": {
    "src": "/assets/mobile/vectra-miniapp-knowledge.jpg",
    "width": 627,
    "height": 1280,
    "portrait": true,
    "deviceFrame": "iphone",
    "enhanced": false,
    "concept": false
  },
  "/assets/vectra-messages.png": {
    "src": "/assets/mobile/vectra-miniapp-messages.jpg",
    "width": 630,
    "height": 1280,
    "portrait": true,
    "deviceFrame": "iphone",
    "enhanced": false,
    "concept": false
  },
  "/assets/vectra-statistics.png": {
    "src": "/assets/mobile/vectra-miniapp-statistics.jpg",
    "width": 626,
    "height": 1280,
    "portrait": true,
    "deviceFrame": "iphone",
    "enhanced": false,
    "concept": false
  }
};

export function getScreenshot(src: string): Screenshot {
  const screenshot = screenshots[src];
  if (!screenshot) throw new Error(`Screenshot is not registered: ${src}`);
  return screenshot;
}
