"""Chinese-to-English translations + specialty grouping for the CFDI extract.

ZH is always authoritative: EN strings are curated (provinces, cities, roles,
top sites) or pattern-derived (sites, specialty subspecialties) and labeled
as such in the UI. Investigator names are never translated.
"""

from __future__ import annotations

PROVINCE_EN = {
    "北京市": "Beijing", "天津市": "Tianjin", "河北省": "Hebei",
    "山西省": "Shanxi", "内蒙古自治区": "Inner Mongolia", "辽宁省": "Liaoning",
    "吉林省": "Jilin", "黑龙江省": "Heilongjiang", "上海市": "Shanghai",
    "江苏省": "Jiangsu", "浙江省": "Zhejiang", "安徽省": "Anhui",
    "福建省": "Fujian", "江西省": "Jiangxi", "山东省": "Shandong",
    "河南省": "Henan", "湖北省": "Hubei", "湖南省": "Hunan",
    "广东省": "Guangdong", "广西壮族自治区": "Guangxi", "海南省": "Hainan",
    "重庆市": "Chongqing", "四川省": "Sichuan", "贵州省": "Guizhou",
    "云南省": "Yunnan", "西藏自治区": "Tibet", "陕西省": "Shaanxi",
    "甘肃省": "Gansu", "青海省": "Qinghai", "宁夏回族自治区": "Ningxia",
    "新疆维吾尔自治区": "Xinjiang",
}

CITY_EN = {
    "北京市": "Beijing", "南通市": "Nantong", "厦门市": "Xiamen",
    "哈尔滨市": "Harbin", "大连市": "Dalian", "宁德市": "Ningde",
    "宜兴市": "Yixing", "宜昌市": "Yichang", "宿迁市": "Suqian",
    "广州市": "Guangzhou", "德州市": "Dezhou", "成都市": "Chengdu",
    "新泰市": "Xintai", "昆明市": "Kunming", "杭州市": "Hangzhou",
    "济南市": "Jinan", "深圳市": "Shenzhen", "潍坊市": "Weifang",
    "石家庄市": "Shijiazhuang", "福州市": "Fuzhou", "自贡市": "Zigong",
    "衡阳市": "Hengyang", "郴州市": "Chenzhou", "都江堰市": "Dujiangyan",
    "鹰潭市": "Yingtan",
}

ROLE_EN = {
    "主要研究者": "Principal Investigator",
    "备案PI": "Registered PI",
    "PI": "PI",
    "药物临床试验备案主要研究者": "Registered drug-trial PI",
    "主要研究者(PI)": "Principal Investigator (PI)",
}

# Bare specialty strings (no department- prefix) with curated EN.
SPECIALTY_STR_EN = {
    "肿瘤科": "Oncology", "眼科": "Ophthalmology", "麻醉科": "Anesthesiology",
    "急诊医学科": "Emergency Medicine", "重症医学科": "Critical Care Medicine",
    "康复医学科": "Rehabilitation Medicine", "结核病科": "Tuberculosis",
    "内科": "Internal Medicine", "外科": "Surgery", "儿科": "Pediatrics",
    "妇产科": "Obstetrics & Gynecology", "耳鼻咽喉科": "ENT",
    "口腔科": "Stomatology", "中医科": "Traditional Chinese Medicine",
    "传染科": "Infectious Diseases", "皮肤科": "Dermatology",
    "精神科": "Psychiatry", "病理科": "Pathology", "检验科": "Laboratory Medicine",
    "输血科": "Transfusion Medicine", "营养科": "Nutrition",
    "全科": "General Practice", "老年科": "Geriatrics",
    "疼痛科": "Pain Medicine", "介入科": "Interventional Medicine",
    "放疗科": "Radiation Oncology", "核医学科": "Nuclear Medicine",
    "超声科": "Ultrasound", "放射科": "Radiology",
}

# Sub-specialty EN for "dept-sub" patterns: (group_en, group_zh, {sub_zh: sub_en}).
SUB_EN = {
    "内科": ("Internal Medicine", "内科", {
        "心血管内科专业": "Cardiology", "呼吸内科专业": "Respiratory",
        "神经内科专业": "Neurology", "内分泌专业": "Endocrinology",
        "消化内科专业": "Gastroenterology", "血液内科专业": "Hematology",
        "肾病学专业": "Nephrology", "免疫学专业": "Immunology",
        "老年病专业": "Geriatrics", "风湿免疫专业": "Rheumatology",
        "感染病专业": "Infectious Diseases"}),
    "外科": ("Surgery", "外科", {
        "骨科专业": "Orthopedics", "泌尿外科专业": "Urology",
        "普通外科专业": "General Surgery", "神经外科专业": "Neurosurgery",
        "胸外科专业": "Thoracic Surgery", "烧伤外科专业": "Burn Surgery",
        "心脏大血管外科专业": "Cardiothoracic Surgery", "肝胆外科专业": "Hepatobiliary Surgery",
        "胃肠外科专业": "GI Surgery", "甲状腺乳腺外科专业": "Thyroid & Breast Surgery",
        "整形外科专业": "Plastic Surgery", "血管外科专业": "Vascular Surgery",
        "肛肠外科专业": "Colorectal Surgery", "小儿外科专业": "Pediatric Surgery"}),
    "妇产科": ("OB/GYN", "妇产科", {
        "妇科专业": "Gynecology", "产科专业": "Obstetrics",
        "生殖健康与不孕症专业": "Reproductive Medicine", "计划生育专业": "Family Planning"}),
    "儿科": ("Pediatrics", "儿科", {
        "小儿呼吸专业": "Respiratory", "小儿血液病专业": "Hematology",
        "小儿神经病学专业": "Neurology", "小儿内分泌专业": "Endocrinology",
        "小儿消化专业": "Gastroenterology", "小儿肾病专业": "Nephrology",
        "新生儿专业": "Neonatology", "小儿外科专业": "Pediatric Surgery",
        "小儿心血管专业": "Cardiology"}),
    "皮肤科": ("Dermatology", "皮肤科", {
        "皮肤病专业": "Dermatology", "性传播疾病专业": "STD"}),
    "精神科": ("Psychiatry", "精神科", {
        "精神病专业": "Psychiatry", "精神卫生专业": "Mental Health"}),
    "耳鼻咽喉科": ("ENT", "耳鼻咽喉科", {
        "鼻科专业": "Rhinology", "咽喉科专业": "Laryngology",
        "耳科专业": "Otology", "头颈外科专业": "Head & Neck Surgery"}),
    "医学影像科": ("Radiology", "医学影像科", {
        "核医学专业": "Nuclear Medicine", "放射治疗专业": "Radiation Oncology",
        "介入放射学专业": "Interventional Radiology", "磁共振成像诊断专业": "MRI",
        "CT诊断专业": "CT", "X线诊断专业": "X-ray", "超声诊断专业": "Ultrasound"}),
    "传染科": ("Infectious Diseases", "传染科", {
        "肝炎专业": "Hepatitis", "呼吸道传染病专业": "Respiratory Infections",
        "肠道传染病专业": "Enteric Infections", "艾滋病专业": "HIV/AIDS"}),
    "中医科": ("TCM", "中医科", {}),
}

# Bare-keyword groups for strings matching no pattern above: (keyword, group_en, group_zh).
BARE_RULES = [
    ("肿瘤", "Oncology", "肿瘤"), ("癌", "Oncology", "肿瘤"),
    ("眼科", "Ophthalmology", "眼科"), ("急诊", "Emergency", "急诊"),
    ("重症", "Critical Care", "重症"), ("康复", "Rehabilitation", "康复"),
    ("结核", "Tuberculosis", "结核"), ("麻醉", "Anesthesiology", "麻醉"),
    ("疼痛", "Pain Medicine", "疼痛"), ("口腔", "Stomatology", "口腔"),
    ("病理", "Pathology", "病理"), ("检验", "Lab Medicine", "检验"),
    ("输血", "Transfusion", "输血"), ("营养", "Nutrition", "营养"),
    ("全科", "General Practice", "全科"), ("老年", "Geriatrics", "老年"),
    ("骨科", "Orthopedics", "骨科"), ("泌尿", "Urology", "泌尿"),
    ("妇科", "Gynecology", "妇科"), ("产科", "Obstetrics", "产科"),
    ("血液", "Hematology", "血液"), ("肾", "Nephrology", "肾脏"),
    ("内分泌", "Endocrinology", "内分泌"), ("消化", "Gastroenterology", "消化"),
    ("呼吸", "Respiratory", "呼吸"), ("心血管", "Cardiology", "心血管"),
    ("心内", "Cardiology", "心血管"), ("神经", "Neurology", "神经"),
    ("精神", "Psychiatry", "精神"), ("皮肤", "Dermatology", "皮肤"),
    ("耳鼻咽喉", "ENT", "耳鼻咽喉"), ("超声", "Ultrasound", "超声"),
    ("放射", "Radiology", "放射"), ("核医学", "Nuclear Medicine", "核医学"),
]


def group_specialty(s: str) -> tuple[str, str, str | None]:
    """Return (group_en, group_zh, specialty_en|None) for a raw specialty string."""
    s = (s or "").strip()
    if not s:
        return "Other", "其它", None
    if "Ⅰ期" in s or "I期" in s or "生物等效" in s:
        return "Phase I / BE unit", "Ⅰ期/BE", "Phase I / bioequivalence unit"
    if "-" in s or "·" in s:
        head = s.replace("·", "-").split("-", 1)[0]
        sub = s.replace("·", "-").split("-", 1)[1] if "-" in s.replace("·", "-") else ""
        if head in SUB_EN:
            gen, gzh, subs = SUB_EN[head]
            if sub in subs:
                return gen, gzh, f"{gen} · {subs[sub]}"
            for k, v in subs.items():
                if k.replace("专业", "") in sub or sub in k:
                    return gen, gzh, f"{gen} · {v}"
            return gen, gzh, None
    if s in SPECIALTY_STR_EN:
        en = SPECIALTY_STR_EN[s]
        return en, s.rstrip("科") or s, en
    for kw, gen, gzh in BARE_RULES:
        if kw in s:
            return gen, gzh, None
    return "Other", "其它", None


# Top institutions by curated EN (keyed by stable canonical ID).
TOP_SITES_EN = {
    "F4272EC5C0A80333460485425A122D1D": "Peking Union Medical College Hospital",
    "B752A738C0A803337E83CB2CEF61C73D": "Jiangsu Provincial CDC",
    "1EE7CBACC0A803333781C82AE9B72A5D": "West China Hospital, Sichuan University",
    "37551ED6C0A803335A0094CA2F2A9999": "Peking University Third Hospital",
    "D5D39237C0A80333089149662DB7A5BE": "Peking University People's Hospital",
    "56DA0C76C0A8033378166121EF596120": "Hunan Cancer Hospital",
    "0CFC6E5AC0A8033343A80C5F6F68BA6D": "Tongji Hospital, Tongji Medical College, HUST",
    "56984763C0A803336779BABB6FC8FA42": "First Affiliated Hospital of Nanchang University",
    "CFC87CFDC0A8033370F2B59EA8BF5206": "Union Hospital, Tongji Medical College, HUST",
    "382BA8B0C0A803335B4CE03A2F2A2371": "First Affiliated Hospital of Nanjing Medical University",
    "AAF35C6EC0A803332E232C9DE3002662": "Zhongshan Hospital, Fudan University",
    "8C9677C6C0A80333732F874986787CB3": "Nanfang Hospital, Southern Medical University",
    "1CDDFB03C0A803332664670577FB4A58": "First Affiliated Hospital of Zhengzhou University",
    "3BB0A3B4C0A803332A9F6FC83950B0B0": "Xiangya Hospital, Central South University",
    "C6E5940CC0A8033300B5620C99641633": "Renmin Hospital of Wuhan University",
    "28C180C3C0A803337C9A4EAF72B893EA": "First Hospital of Jilin University",
    "D11EA41FC0A80333619244F678FCB2B4": "Third Xiangya Hospital, Central South University",
    "125A1915C0A803337591284873C0EF70": "First Affiliated Hospital of Bengbu Medical University",
    "3CA9EE0FC0A803331E2817E89DD297D8": "Qilu Hospital of Shandong University",
    "37EFA41BC0A80333569C95B50990FE67": "Affiliated Hospital of Xuzhou Medical University",
    "B409A9E9C0A803333B97A6234872ADF7": "First Affiliated Hospital, Zhejiang University",
    "5577712BC0A8033304FCB807DBD904E0": "Gansu Provincial People's Hospital",
    "F338E66CC0A803337ADCDF3AC9B68FA1": "Zhejiang Hospital",
    "CF7FAFE0C0A803337C221769696693DC": "Sun Yat-sen Memorial Hospital, Sun Yat-sen University",
    "F38BBD78C0A80333056A73B8390ED2C2": "Tianjin Medical University Cancer Hospital",
    "C96CB6CFC0A80333106C5822B7F9113E": "First Affiliated Hospital of Xinjiang Medical University",
    "E9931CAFC0A80333076533365DAF5152": "Hangzhou First People's Hospital",
    "F4F98652C0A803335F197E2DF8EC0B2E": "First Affiliated Hospital of Xi'an Jiaotong University",
    "19D376DCC0A803332EF941E3D98754C0": "Second Xiangya Hospital, Central South University",
}

# Ordered structural replacements for pattern site translation (longest first).
_SITE_PATTERNS = [
    ("医科大学", "Medical University"), ("大学", "University"),
    ("医学院", "Medical College"), ("学院", "College"),
    ("疾病预防控制中心", "Center for Disease Control and Prevention"),
    ("公共卫生研究院", "Institute of Public Health"),
    ("妇幼保健院", "Maternal and Child Health Hospital"),
    ("中西医结合医院", "Hospital of Integrated TCM & Western Medicine"),
    ("中医院", "Hospital of Traditional Chinese Medicine"),
    ("肿瘤医院", "Cancer Hospital"), ("儿童医院", "Children's Hospital"),
    ("口腔医院", "Stomatological Hospital"), ("眼科医院", "Eye Hospital"),
    ("传染病医院", "Infectious Disease Hospital"),
    ("精神卫生中心", "Mental Health Center"), ("卫生中心", "Health Center"),
    ("人民医院", "People's Hospital"), ("中心医院", "Central Hospital"),
    ("附属医院", "Affiliated Hospital"), ("附属", "Affiliated"),
    ("医院", "Hospital"), ("第四", "Fourth"), ("第三", "Third"),
    ("第二", "Second"), ("第一", "First"),
]


def site_name_en(name_zh: str, inst_id: str, province_zh: str = "") -> tuple[str, bool]:
    """Return (EN label, curated?) for an institution. ZH nouns without a
    romanization stay in Chinese (partial pattern translation)."""
    if inst_id in TOP_SITES_EN:
        return TOP_SITES_EN[inst_id], True
    base = (name_zh or "").split("（")[0].strip()
    out = base
    for zh, en in _SITE_PATTERNS:
        out = out.replace(zh, f" {en} ")
    for zh, en in list(PROVINCE_EN.items()) + list(CITY_EN.items()):
        if zh in out:
            out = out.replace(zh, f" {en} ")
    for zh, en in list(PROVINCE_EN.items()) + list(CITY_EN.items()):
        short = zh.replace("省", "").replace("市", "").replace("自治区", "")
        if short and short in out:
            out = out.replace(short, f" {en} ")
    out = " ".join(out.split())
    return (out if out != base else base), False


def translate_place(province_zh: str, city_zh: str | None = None) -> tuple[str, str | None]:
    return (PROVINCE_EN.get(province_zh or "", province_zh or ""),
            CITY_EN.get(city_zh or "", city_zh) if city_zh else None)
