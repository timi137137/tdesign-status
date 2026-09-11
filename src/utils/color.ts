import { Color } from 'tvision-color';

import { TColorToken } from '@/config/color';

type ChartLike = {
  getOption: () => Record<string, unknown>;
  setOption: (option: Record<string, unknown>, notMerge?: boolean) => void;
};

export function getColorFromTheme(): Array<string> {
  const theme = getComputedStyle(document.documentElement).getPropertyValue('--td-brand-color').trim() || '#0052D9';
  return Color.getRandomPalette({
    color: theme,
    colorGamut: 'bright',
    number: 8,
  });
}

export function getChartListColor(): Array<string> {
  return getColorFromTheme();
}

export function changeChartsTheme(chartsList: ChartLike[]): void {
  const chartChangeColor = getChartListColor();
  chartsList.forEach((chart) => {
    if (!chart) return;
    const optionVal = chart.getOption();
    optionVal.color = chartChangeColor;
    chart.setOption(optionVal, true);
  });
}

/**
 * 根据当前主题色、模式等情景 计算最后生成的色阶
 */
export function generateColorMap(
  theme: string,
  colorPalette: Array<string>,
  mode: 'light' | 'dark',
  brandColorIdx: number,
) {
  const isDarkMode = mode === 'dark';

  if (isDarkMode) {
    colorPalette.reverse().map((color) => {
      const [h, s, l] = Color.colorTransform(color, 'hex', 'hsl');
      return Color.colorTransform([h, Number(s) - 4, l], 'hsl', 'hex');
    });
    brandColorIdx = 5;
    colorPalette[0] = `${colorPalette[brandColorIdx]}20`;
  }

  const colorMap = {
    '--td-brand-color': colorPalette[brandColorIdx],
    '--td-brand-color-1': colorPalette[0],
    '--td-brand-color-2': colorPalette[1],
    '--td-brand-color-3': colorPalette[2],
    '--td-brand-color-4': colorPalette[3],
    '--td-brand-color-5': colorPalette[4],
    '--td-brand-color-6': colorPalette[5],
    '--td-brand-color-7': brandColorIdx > 0 ? colorPalette[brandColorIdx - 1] : theme,
    '--td-brand-color-8': colorPalette[brandColorIdx],
    '--td-brand-color-9': brandColorIdx > 8 ? theme : colorPalette[brandColorIdx + 1],
    '--td-brand-color-10': colorPalette[9],
  };
  return colorMap;
}

/**
 * 将生成的样式嵌入头部
 */
export function insertThemeStylesheet(theme: string, colorMap: TColorToken, mode: 'light' | 'dark') {
  const isDarkMode = mode === 'dark';
  const root = !isDarkMode ? `:root[theme-color='${theme}']` : `:root[theme-color='${theme}'][theme-mode='dark']`;

  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = `${root}{
    --td-brand-color: ${colorMap['--td-brand-color']};
    --td-brand-color-1: ${colorMap['--td-brand-color-1']};
    --td-brand-color-2: ${colorMap['--td-brand-color-2']};
    --td-brand-color-3: ${colorMap['--td-brand-color-3']};
    --td-brand-color-4: ${colorMap['--td-brand-color-4']};
    --td-brand-color-5: ${colorMap['--td-brand-color-5']};
    --td-brand-color-6: ${colorMap['--td-brand-color-6']};
    --td-brand-color-7: ${colorMap['--td-brand-color-7']};
    --td-brand-color-8: ${colorMap['--td-brand-color-8']};
    --td-brand-color-9: ${colorMap['--td-brand-color-9']};
    --td-brand-color-10: ${colorMap['--td-brand-color-10']};
  }`;

  document.head.appendChild(styleSheet);
}
