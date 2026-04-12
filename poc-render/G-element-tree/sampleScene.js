import { HEIGHT, WIDTH } from './sceneModel.js';

export function buildSampleScene() {
  return {
    id: 'slide_root',
    type: 'group',
    children: [
      {
        id: 'bg',
        type: 'rect',
        x: 0,
        y: 0,
        w: WIDTH,
        h: HEIGHT,
        fill: '#09111f',
      },
      {
        id: 'title',
        type: 'text',
        x: 140,
        y: 146,
        content: 'PRODUCT LAUNCH',
        fontSize: 112,
        fontWeight: 800,
        fontFamily: 'Arial',
        fill: '#f5f7ff',
      },
      {
        id: 'subtitle',
        type: 'text',
        x: 146,
        y: 292,
        content: 'Three hero SKUs. One confident launch story.',
        fontSize: 42,
        fontWeight: 500,
        fontFamily: 'Arial',
        fill: '#b6c2e2',
      },
      {
        id: 'circle_cluster',
        type: 'group',
        x: 1420,
        y: 518,
        transform: { rotate: -0.18 },
        children: [
          {
            id: 'circle_1',
            type: 'circle',
            x: 0,
            y: 0,
            r: 170,
            fill: '#ff6b6b',
            opacity: 0.95,
          },
          {
            id: 'circle_2',
            type: 'circle',
            x: -210,
            y: 184,
            r: 122,
            fill: '#2ec4b6',
            opacity: 0.92,
          },
          {
            id: 'circle_3',
            type: 'circle',
            x: 188,
            y: 156,
            r: 138,
            fill: '#4d96ff',
            opacity: 0.92,
          },
        ],
      },
    ],
  };
}
