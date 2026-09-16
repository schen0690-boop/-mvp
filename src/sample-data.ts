import type {CandidateMember} from './domain/lineup.js';
/** 人工编写的本地虚构样例，不是模型生成记录；稳定requestId仅用于导入幂等。 */
export interface Sample {requestId:string;topic:string;expertCount:number;roles:CandidateMember[]}
export const samples:Sample[]=[
  {
    "requestId": "70707070-7070-4070-8070-000000000001",
    "topic": "【预置样例·虚构】AI 如何改善教育？",
    "expertCount": 2,
    "roles": [
      {
        "role": "moderator",
        "name": "陶言（虚构）",
        "profession": "教育记者",
        "title": "圆桌主持",
        "stance": "区分学习成效与技术宣传"
      },
      {
        "role": "expert",
        "name": "苏禾（虚构）",
        "profession": "中学教师",
        "title": "教学研究员",
        "stance": "优先评价反馈质量与教师负担"
      },
      {
        "role": "expert",
        "name": "孟青（虚构）",
        "profession": "教育政策研究者",
        "title": "教育公平研究员",
        "stance": "先核查资源差距和学生数据保护"
      }
    ]
  },
  {
    "requestId": "70707070-7070-4070-8070-000000000002",
    "topic": "【预置样例·虚构】城市应如何分配公共空间？",
    "expertCount": 3,
    "roles": [
      {
        "role": "moderator",
        "name": "沈砚（虚构）",
        "profession": "城市议题编辑",
        "title": "公共讨论主持",
        "stance": "厘清不同使用者的需求"
      },
      {
        "role": "expert",
        "name": "顾川（虚构）",
        "profession": "城市规划师",
        "title": "步行系统设计师",
        "stance": "优先保障步行与公共交通可达性"
      },
      {
        "role": "expert",
        "name": "陆岚（虚构）",
        "profession": "社区工作者",
        "title": "邻里协调员",
        "stance": "强调老年人与儿童的休憩空间"
      },
      {
        "role": "expert",
        "name": "纪澄（虚构）",
        "profession": "商户经营者",
        "title": "街区商业顾问",
        "stance": "考察装卸通行与小商户成本"
      }
    ]
  },
  {
    "requestId": "70707070-7070-4070-8070-000000000003",
    "topic": "【预置样例·虚构】企业如何实施四天工作制？",
    "expertCount": 2,
    "roles": [
      {
        "role": "moderator",
        "name": "许宁（虚构）",
        "profession": "劳动记者",
        "title": "职场圆桌主持",
        "stance": "比较行业条件而非简单赞成反对"
      },
      {
        "role": "expert",
        "name": "程遥（虚构）",
        "profession": "人力资源经理",
        "title": "组织发展顾问",
        "stance": "用交付质量与员工留任评估试点"
      },
      {
        "role": "expert",
        "name": "安序（虚构）",
        "profession": "制造工程师",
        "title": "产线计划员",
        "stance": "关注轮班连续性和单位产出成本"
      }
    ]
  },
  {
    "requestId": "70707070-7070-4070-8070-000000000004",
    "topic": "【预置样例·虚构】博物馆应怎样使用数字展览？",
    "expertCount": 3,
    "roles": [
      {
        "role": "moderator",
        "name": "白舟（虚构）",
        "profession": "文化编辑",
        "title": "文化议题主持",
        "stance": "区分公共教育与娱乐流量目标"
      },
      {
        "role": "expert",
        "name": "唐溪（虚构）",
        "profession": "博物馆策展人",
        "title": "数字策展研究员",
        "stance": "数字叙事应服务实物理解"
      },
      {
        "role": "expert",
        "name": "杜微（虚构）",
        "profession": "无障碍设计师",
        "title": "体验研究员",
        "stance": "提供不同感官能力的访问方式"
      },
      {
        "role": "expert",
        "name": "郁辰（虚构）",
        "profession": "文物保护员",
        "title": "藏品保护专家",
        "stance": "不以传播效果牺牲文物保存"
      }
    ]
  },
  {
    "requestId": "70707070-7070-4070-8070-000000000005",
    "topic": "【预置样例·虚构】社区如何减少食物浪费？",
    "expertCount": 4,
    "roles": [
      {
        "role": "moderator",
        "name": "罗清（虚构）",
        "profession": "公益记者",
        "title": "社区协商主持",
        "stance": "比较可执行措施及受益群体"
      },
      {
        "role": "expert",
        "name": "季朗（虚构）",
        "profession": "餐饮经营者",
        "title": "餐厅运营顾问",
        "stance": "从采购预测和分量选择减少损耗"
      },
      {
        "role": "expert",
        "name": "叶寻（虚构）",
        "profession": "食品安全研究者",
        "title": "冷链质量顾问",
        "stance": "再分配必须满足储存与追溯条件"
      },
      {
        "role": "expert",
        "name": "江念（虚构）",
        "profession": "社区志愿者",
        "title": "互助网络协调员",
        "stance": "降低领取门槛并保护居民尊严"
      },
      {
        "role": "expert",
        "name": "闻朔（虚构）",
        "profession": "环境工程师",
        "title": "资源循环研究员",
        "stance": "依据全生命周期衡量减废收益"
      }
    ]
  }
];
