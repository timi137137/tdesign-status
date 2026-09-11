import { TChartColor } from '@/config/color';
import { getDateArray } from '@/utils/charts';
import { getChartListColor } from '@/utils/color';

export interface UserChartSeries {
  name: string;
  data: number[];
}

/** 折线图数据：默认空序列，由个人页填入真实服务可用率 */
export function getFolderLineDataSet({
  dateTime = [],
  placeholderColor,
  borderColor,
  series = [],
}: { dateTime?: Array<string>; series?: UserChartSeries[] } & TChartColor) {
  let dateArray: Array<string> = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  if (dateTime.length > 0) {
    const divideNum = 7;
    dateArray = getDateArray(dateTime, divideNum);
  }
  return {
    color: getChartListColor(),
    grid: {
      top: '5%',
      right: '10px',
      left: '30px',
      bottom: '60px',
    },
    legend: {
      left: 'center',
      bottom: '0',
      orient: 'horizontal',
      data: series.map((item) => item.name),
      textStyle: {
        fontSize: 12,
        color: placeholderColor,
      },
    },
    xAxis: {
      type: 'category',
      data: dateArray,
      boundaryGap: false,
      axisLabel: {
        color: placeholderColor,
      },
      axisLine: {
        lineStyle: {
          color: borderColor,
          width: 1,
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: placeholderColor,
      },
      splitLine: {
        lineStyle: {
          color: borderColor,
        },
      },
    },
    tooltip: {
      trigger: 'item',
    },
    series: series.map((item) => ({
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 8,
      name: item.name,
      stack: '总量',
      data: item.data,
      type: 'line',
      itemStyle: {
        borderColor,
        borderWidth: 1,
      },
    })),
  };
}
