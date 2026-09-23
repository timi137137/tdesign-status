export interface UserInfoListType {
  title: string;
  content: string;
  span?: number;
}

export const USER_INFO_LIST: Array<UserInfoListType> = [
  {
    title: '手机',
    content: '+86 13923734567',
  },
  {
    title: '座机',
    content: '734567',
  },
  {
    title: '办公室邮箱',
    content: 'Account@qq.com',
  },
  {
    title: '座位',
    content: 'T32F 012',
  },
  {
    title: '管理主体',
    content: '腾讯集团',
  },
  {
    title: '直属上级',
    content: 'Michael Wang',
  },
  {
    title: '职位',
    content: '高级 UI 设计师',
  },
  {
    title: '入职时间',
    content: '2021-07-01',
  },
  {
    title: '所属团队',
    content: '腾讯/腾讯公司/某事业群/某产品部/某运营中心/商户服务组',
    span: 6,
  },
];

export interface TeamMember {
  avatar: string;
  title: string;
  description: string;
}

export const TEAM_MEMBERS: TeamMember[] = [];

export const PRODUCT_LIST = ['a', 'b', 'c', 'd'];
