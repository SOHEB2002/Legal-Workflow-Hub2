import { createContext, useContext, useState, useEffect } from "react";
import type { ReviewStandard, ReviewResult, ReviewStandardTypeValue, ReviewCategory, ReviewCheckpoint } from "@shared/schema";

interface StandardsContextType {
  standards: ReviewStandard[];
  reviewResults: ReviewResult[];
  addStandard: (standard: Omit<ReviewStandard, "id" | "createdAt" | "updatedAt">) => void;
  updateStandard: (id: string, data: Partial<ReviewStandard>) => void;
  deleteStandard: (id: string) => void;
  getStandardById: (id: string) => ReviewStandard | undefined;
  getStandardsByType: (type: ReviewStandardTypeValue) => ReviewStandard[];
  saveReviewResult: (result: Omit<ReviewResult, "id" | "createdAt" | "updatedAt">) => void;
  updateReviewResult: (id: string, data: Partial<ReviewResult>) => void;
  getReviewHistory: (caseId?: string, consultationId?: string) => ReviewResult[];
  getReviewResultById: (id: string) => ReviewResult | undefined;
}

const StandardsContext = createContext<StandardsContextType | undefined>(undefined);

const STANDARDS_STORAGE_KEY = "lawfirm_review_standards";
const RESULTS_STORAGE_KEY = "lawfirm_review_results";

const defaultStandards: ReviewStandard[] = [
  {
    id: "std-1",
    title: "معايير مراجعة العقود التجارية",
    type: "contract_review",
    description: "معايير شاملة لمراجعة العقود التجارية والاتفاقيات",
    categories: [
      {
        id: "cat-1-1",
        name: "البيانات الأساسية",
        checkpoints: [
          { id: "cp-1-1-1", text: "التحقق من صحة بيانات الأطراف المتعاقدة", isRequired: true },
          { id: "cp-1-1-2", text: "التحقق من أهلية الأطراف للتعاقد", isRequired: true },
          { id: "cp-1-1-3", text: "التحقق من صحة السجل التجاري", isRequired: true },
          { id: "cp-1-1-4", text: "التحقق من صلاحية التوكيلات والتفويضات", isRequired: true },
        ],
      },
      {
        id: "cat-1-2",
        name: "موضوع العقد",
        checkpoints: [
          { id: "cp-1-2-1", text: "وضوح موضوع العقد ومحله", isRequired: true },
          { id: "cp-1-2-2", text: "تحديد نطاق الالتزامات بدقة", isRequired: true },
          { id: "cp-1-2-3", text: "عدم مخالفة النظام العام", isRequired: true },
          { id: "cp-1-2-4", text: "مشروعية محل العقد", isRequired: true },
        ],
      },
      {
        id: "cat-1-3",
        name: "الالتزامات المالية",
        checkpoints: [
          { id: "cp-1-3-1", text: "وضوح المقابل المالي", isRequired: true },
          { id: "cp-1-3-2", text: "تحديد طريقة وجدول السداد", isRequired: true },
          { id: "cp-1-3-3", text: "شروط الغرامات والتعويضات", isRequired: false },
          { id: "cp-1-3-4", text: "آلية تعديل الأسعار", isRequired: false },
        ],
      },
      {
        id: "cat-1-4",
        name: "المدة والإنهاء",
        checkpoints: [
          { id: "cp-1-4-1", text: "تحديد مدة العقد بوضوح", isRequired: true },
          { id: "cp-1-4-2", text: "شروط التجديد", isRequired: false },
          { id: "cp-1-4-3", text: "حالات الإنهاء المبكر", isRequired: true },
          { id: "cp-1-4-4", text: "آثار الإنهاء على الأطراف", isRequired: true },
        ],
      },
      {
        id: "cat-1-5",
        name: "الضمانات والتعهدات",
        checkpoints: [
          { id: "cp-1-5-1", text: "وجود ضمانات كافية", isRequired: false },
          { id: "cp-1-5-2", text: "شروط خطاب الضمان", isRequired: false },
          { id: "cp-1-5-3", text: "تعهدات الأطراف", isRequired: true },
        ],
      },
      {
        id: "cat-1-6",
        name: "حل النزاعات",
        checkpoints: [
          { id: "cp-1-6-1", text: "تحديد آلية حل النزاعات", isRequired: true },
          { id: "cp-1-6-2", text: "تحديد القانون الواجب التطبيق", isRequired: true },
          { id: "cp-1-6-3", text: "تحديد الاختصاص القضائي", isRequired: true },
          { id: "cp-1-6-4", text: "شرط التحكيم (إن وجد)", isRequired: false },
        ],
      },
      {
        id: "cat-1-7",
        name: "السرية والملكية الفكرية",
        checkpoints: [
          { id: "cp-1-7-1", text: "بنود السرية", isRequired: false },
          { id: "cp-1-7-2", text: "حماية الملكية الفكرية", isRequired: false },
          { id: "cp-1-7-3", text: "عدم المنافسة", isRequired: false },
        ],
      },
      {
        id: "cat-1-8",
        name: "القوة القاهرة",
        checkpoints: [
          { id: "cp-1-8-1", text: "تعريف حالات القوة القاهرة", isRequired: false },
          { id: "cp-1-8-2", text: "آثار القوة القاهرة", isRequired: false },
          { id: "cp-1-8-3", text: "إجراءات الإخطار", isRequired: false },
        ],
      },
      {
        id: "cat-1-9",
        name: "الأحكام العامة",
        checkpoints: [
          { id: "cp-1-9-1", text: "شرط التعديل", isRequired: true },
          { id: "cp-1-9-2", text: "شرط التنازل", isRequired: true },
          { id: "cp-1-9-3", text: "استقلالية البنود", isRequired: false },
          { id: "cp-1-9-4", text: "الإشعارات والمراسلات", isRequired: true },
        ],
      },
      {
        id: "cat-1-10",
        name: "الصياغة القانونية",
        checkpoints: [
          { id: "cp-1-10-1", text: "وضوح الصياغة القانونية", isRequired: true },
          { id: "cp-1-10-2", text: "عدم وجود تناقض بين البنود", isRequired: true },
          { id: "cp-1-10-3", text: "اكتمال العقد وعدم وجود فراغات", isRequired: true },
        ],
      },
      {
        id: "cat-1-11",
        name: "التوقيعات",
        checkpoints: [
          { id: "cp-1-11-1", text: "صحة التوقيعات", isRequired: true },
          { id: "cp-1-11-2", text: "ختم الشركة (للشركات)", isRequired: true },
          { id: "cp-1-11-3", text: "التوثيق (إن لزم)", isRequired: false },
        ],
      },
      {
        id: "cat-1-12",
        name: "الملاحق والمرفقات",
        checkpoints: [
          { id: "cp-1-12-1", text: "اكتمال الملاحق المشار إليها", isRequired: true },
          { id: "cp-1-12-2", text: "توقيع الملاحق", isRequired: true },
          { id: "cp-1-12-3", text: "ترقيم الصفحات", isRequired: false },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "std-2",
    title: "معايير مراجعة الاستشارات القانونية",
    type: "legal_consultation",
    description: "معايير جودة الاستشارات القانونية المقدمة للعملاء",
    categories: [
      {
        id: "cat-2-1",
        name: "فهم السؤال",
        checkpoints: [
          { id: "cp-2-1-1", text: "فهم واضح لسؤال العميل", isRequired: true },
          { id: "cp-2-1-2", text: "تحديد جميع جوانب الاستفسار", isRequired: true },
          { id: "cp-2-1-3", text: "طلب استيضاحات إضافية عند الحاجة", isRequired: false },
        ],
      },
      {
        id: "cat-2-2",
        name: "البحث والتحليل",
        checkpoints: [
          { id: "cp-2-2-1", text: "البحث في الأنظمة ذات العلاقة", isRequired: true },
          { id: "cp-2-2-2", text: "مراجعة السوابق القضائية", isRequired: false },
          { id: "cp-2-2-3", text: "تحليل قانوني شامل", isRequired: true },
          { id: "cp-2-2-4", text: "الاستناد إلى مصادر موثوقة", isRequired: true },
        ],
      },
      {
        id: "cat-2-3",
        name: "الرد والتوصيات",
        checkpoints: [
          { id: "cp-2-3-1", text: "وضوح الرد وسهولة فهمه", isRequired: true },
          { id: "cp-2-3-2", text: "تقديم توصيات عملية", isRequired: true },
          { id: "cp-2-3-3", text: "ذكر البدائل المتاحة", isRequired: false },
          { id: "cp-2-3-4", text: "تحديد المخاطر المحتملة", isRequired: true },
        ],
      },
      {
        id: "cat-2-4",
        name: "الشكل والتوثيق",
        checkpoints: [
          { id: "cp-2-4-1", text: "تنسيق احترافي للمستند", isRequired: true },
          { id: "cp-2-4-2", text: "ذكر المراجع والمصادر", isRequired: false },
          { id: "cp-2-4-3", text: "خلو النص من الأخطاء اللغوية", isRequired: true },
          { id: "cp-2-4-4", text: "حفظ نسخة في ملف العميل", isRequired: true },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "std-3",
    title: "معايير مراجعة تقارير الجلسات",
    type: "session_report",
    description: "معايير توثيق وإعداد تقارير الجلسات القضائية",
    categories: [
      {
        id: "cat-3-1",
        name: "البيانات الأساسية",
        checkpoints: [
          { id: "cp-3-1-1", text: "ذكر رقم القضية والمحكمة", isRequired: true },
          { id: "cp-3-1-2", text: "تاريخ ووقت الجلسة", isRequired: true },
          { id: "cp-3-1-3", text: "اسم القاضي والدائرة", isRequired: true },
          { id: "cp-3-1-4", text: "الحاضرون في الجلسة", isRequired: true },
        ],
      },
      {
        id: "cat-3-2",
        name: "محتوى التقرير",
        checkpoints: [
          { id: "cp-3-2-1", text: "ملخص ما دار في الجلسة", isRequired: true },
          { id: "cp-3-2-2", text: "الطلبات المقدمة", isRequired: true },
          { id: "cp-3-2-3", text: "قرار المحكمة", isRequired: true },
          { id: "cp-3-2-4", text: "موعد الجلسة القادمة", isRequired: true },
        ],
      },
      {
        id: "cat-3-3",
        name: "المتابعة",
        checkpoints: [
          { id: "cp-3-3-1", text: "المهام المطلوبة للجلسة القادمة", isRequired: true },
          { id: "cp-3-3-2", text: "المستندات المطلوب تقديمها", isRequired: false },
          { id: "cp-3-3-3", text: "إبلاغ العميل بنتيجة الجلسة", isRequired: true },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "std-4",
    title: "معايير مراجعة الخطابات القانونية",
    type: "legal_letter",
    description: "معايير إعداد ومراجعة الخطابات والمذكرات القانونية",
    categories: [
      {
        id: "cat-4-1",
        name: "الشكل والتنسيق",
        checkpoints: [
          { id: "cp-4-1-1", text: "استخدام الترويسة الرسمية", isRequired: true },
          { id: "cp-4-1-2", text: "التاريخ والرقم المرجعي", isRequired: true },
          { id: "cp-4-1-3", text: "بيانات المرسل إليه صحيحة", isRequired: true },
          { id: "cp-4-1-4", text: "التنسيق الاحترافي", isRequired: true },
        ],
      },
      {
        id: "cat-4-2",
        name: "المحتوى",
        checkpoints: [
          { id: "cp-4-2-1", text: "وضوح الموضوع والغرض", isRequired: true },
          { id: "cp-4-2-2", text: "دقة المعلومات الواردة", isRequired: true },
          { id: "cp-4-2-3", text: "السند النظامي (إن وجد)", isRequired: false },
          { id: "cp-4-2-4", text: "الطلبات واضحة ومحددة", isRequired: true },
        ],
      },
      {
        id: "cat-4-3",
        name: "اللغة والأسلوب",
        checkpoints: [
          { id: "cp-4-3-1", text: "لغة رسمية ومهنية", isRequired: true },
          { id: "cp-4-3-2", text: "خلو من الأخطاء الإملائية", isRequired: true },
          { id: "cp-4-3-3", text: "وضوح وإيجاز العبارات", isRequired: true },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function getStoredStandards(): ReviewStandard[] {
  const stored = localStorage.getItem(STANDARDS_STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  localStorage.setItem(STANDARDS_STORAGE_KEY, JSON.stringify(defaultStandards));
  return defaultStandards;
}

function getStoredResults(): ReviewResult[] {
  const stored = localStorage.getItem(RESULTS_STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return [];
}

export function StandardsProvider({ children }: { children: React.ReactNode }) {
  const [standards, setStandards] = useState<ReviewStandard[]>(() => getStoredStandards());
  const [reviewResults, setReviewResults] = useState<ReviewResult[]>(() => getStoredResults());

  useEffect(() => {
    localStorage.setItem(STANDARDS_STORAGE_KEY, JSON.stringify(standards));
  }, [standards]);

  useEffect(() => {
    localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(reviewResults));
  }, [reviewResults]);

  const addStandard = (standardData: Omit<ReviewStandard, "id" | "createdAt" | "updatedAt">) => {
    const newStandard: ReviewStandard = {
      ...standardData,
      id: `std-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStandards((prev) => [...prev, newStandard]);
  };

  const updateStandard = (id: string, data: Partial<ReviewStandard>) => {
    setStandards((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, ...data, updatedAt: new Date().toISOString() } : s
      )
    );
  };

  const deleteStandard = (id: string) => {
    setStandards((prev) => prev.filter((s) => s.id !== id));
  };

  const getStandardById = (id: string) => {
    return standards.find((s) => s.id === id);
  };

  const getStandardsByType = (type: ReviewStandardTypeValue) => {
    return standards.filter((s) => s.type === type);
  };

  const saveReviewResult = (resultData: Omit<ReviewResult, "id" | "createdAt" | "updatedAt">) => {
    const newResult: ReviewResult = {
      ...resultData,
      id: `result-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setReviewResults((prev) => [...prev, newResult]);
  };

  const updateReviewResult = (id: string, data: Partial<ReviewResult>) => {
    setReviewResults((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
      )
    );
  };

  const getReviewHistory = (caseId?: string, consultationId?: string) => {
    return reviewResults.filter((r) => {
      if (caseId) return r.caseId === caseId;
      if (consultationId) return r.consultationId === consultationId;
      return true;
    });
  };

  const getReviewResultById = (id: string) => {
    return reviewResults.find((r) => r.id === id);
  };

  return (
    <StandardsContext.Provider
      value={{
        standards,
        reviewResults,
        addStandard,
        updateStandard,
        deleteStandard,
        getStandardById,
        getStandardsByType,
        saveReviewResult,
        updateReviewResult,
        getReviewHistory,
        getReviewResultById,
      }}
    >
      {children}
    </StandardsContext.Provider>
  );
}

export function useStandards() {
  const context = useContext(StandardsContext);
  if (context === undefined) {
    throw new Error("useStandards must be used within a StandardsProvider");
  }
  return context;
}
