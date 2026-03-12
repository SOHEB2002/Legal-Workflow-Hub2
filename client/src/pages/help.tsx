import { useState } from "react";
import { 
  HelpCircle, 
  BookOpen, 
  Users, 
  Briefcase, 
  MessageSquare, 
  Calendar,
  ClipboardList,
  Settings,
  Shield,
  ChevronDown,
  ChevronUp,
  Search,
  Play,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TourRestartButton } from "@/components/onboarding-tour";

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  topics: {
    question: string;
    answer: string;
  }[];
}

const helpSections: HelpSection[] = [
  {
    id: "getting-started",
    title: "البداية السريعة",
    icon: <BookOpen className="h-5 w-5" />,
    description: "تعرف على كيفية البدء في استخدام النظام",
    topics: [
      {
        question: "كيف أسجل الدخول للنظام؟",
        answer: "استخدم اسم المستخدم وكلمة المرور المخصصة لك. إذا كانت هذه المرة الأولى، تواصل مع مدير النظام للحصول على بيانات الدخول.",
      },
      {
        question: "ما هي لوحة التحكم؟",
        answer: "لوحة التحكم هي الصفحة الرئيسية التي تعرض ملخصاً لجميع الأنشطة والإحصائيات. يمكنك تخصيصها من خلال إعدادات لوحة التحكم.",
      },
      {
        question: "كيف أستخدم البحث السريع؟",
        answer: "اضغط على Ctrl+K (أو Cmd+K في Mac) لفتح نافذة البحث السريع. يمكنك البحث عن القضايا والعملاء والاستشارات والجلسات.",
      },
    ],
  },
  {
    id: "cases",
    title: "إدارة القضايا",
    icon: <Briefcase className="h-5 w-5" />,
    description: "تعرف على كيفية إدارة القضايا ومراحلها",
    topics: [
      {
        question: "ما هي مراحل القضية؟",
        answer: "تمر القضية بعدة مراحل: استلام، استكمال البيانات، دراسة، تحرير صحيفة الدعوى، لجنة المراجعة، الأخذ بالملاحظات، جاهزة للرفع، قيد التدقيق، مداولة الصلح، أغلق طلب الصلح، ومقفلة.",
      },
      {
        question: "كيف أنقل قضية لمرحلة أخرى؟",
        answer: "افتح تفاصيل القضية واضغط على زر 'تحريك المرحلة' لنقلها للمرحلة التالية. يمكنك أيضاً إرجاعها لمرحلة سابقة إذا لزم الأمر.",
      },
      {
        question: "كيف أضيف قضية جديدة؟",
        answer: "اذهب لصفحة القضايا واضغط على 'إضافة قضية'. قم بتعبئة البيانات المطلوبة واختر العميل والقسم المناسب.",
      },
      {
        question: "كيف أسند قضية لمحامي؟",
        answer: "عند إضافة أو تعديل القضية، اختر المحامي المسؤول من قائمة المحامين المتاحين في القسم.",
      },
    ],
  },
  {
    id: "consultations",
    title: "الاستشارات",
    icon: <MessageSquare className="h-5 w-5" />,
    description: "إدارة الاستشارات القانونية",
    topics: [
      {
        question: "كيف أسجل استشارة جديدة؟",
        answer: "اذهب لصفحة الاستشارات واضغط 'إضافة استشارة'. اختر العميل وحدد نوع الاستشارة والقسم المختص.",
      },
      {
        question: "ما الفرق بين الاستشارة والقضية؟",
        answer: "الاستشارة هي طلب رأي قانوني دون رفع دعوى، بينما القضية تتضمن إجراءات قضائية رسمية أمام المحاكم.",
      },
      {
        question: "كيف أتابع حالة الاستشارة؟",
        answer: "يمكنك متابعة حالة الاستشارة من خلال صفحة الاستشارات حيث تظهر الحالة الحالية لكل استشارة.",
      },
    ],
  },
  {
    id: "hearings",
    title: "الجلسات",
    icon: <Calendar className="h-5 w-5" />,
    description: "جدولة ومتابعة الجلسات",
    topics: [
      {
        question: "كيف أضيف جلسة جديدة؟",
        answer: "اذهب لصفحة الجلسات واضغط 'إضافة جلسة'. اختر القضية المرتبطة وحدد التاريخ والوقت واسم المحكمة.",
      },
      {
        question: "كيف أرى الجلسات القادمة؟",
        answer: "في صفحة الجلسات، يمكنك تصفية الجلسات حسب التاريخ. كما تظهر الجلسات القادمة في لوحة التحكم.",
      },
      {
        question: "ماذا يحدث بعد انتهاء الجلسة؟",
        answer: "بعد انتهاء الجلسة، يمكنك تحديث نتيجتها وإضافة ملاحظات. إذا كان هناك جلسة قادمة، قم بجدولتها.",
      },
    ],
  },
  {
    id: "clients",
    title: "إدارة العملاء",
    icon: <Users className="h-5 w-5" />,
    description: "إدارة بيانات العملاء والتواصل معهم",
    topics: [
      {
        question: "كيف أضيف عميلاً جديداً؟",
        answer: "اذهب لصفحة العملاء واضغط 'إضافة عميل'. اختر نوع العميل (فرد أو شركة) وقم بتعبئة البيانات المطلوبة.",
      },
      {
        question: "كيف أسجل تواصلاً مع عميل؟",
        answer: "افتح تفاصيل العميل واذهب لتبويب 'سجل التواصل'. اضغط 'إضافة تواصل' وسجل نوع التواصل وملخصه.",
      },
      {
        question: "ما هي متابعات العملاء؟",
        answer: "عند تسجيل تواصل، يمكنك تحديد أن هناك متابعة مطلوبة. ستظهر هذه المتابعات في لوحة التحكم للتذكير بها.",
      },
    ],
  },
  {
    id: "field-tasks",
    title: "المهام الميدانية",
    icon: <ClipboardList className="h-5 w-5" />,
    description: "إدارة المهام والمراجعات الخارجية",
    topics: [
      {
        question: "ما هي المهام الميدانية؟",
        answer: "هي مهام تتم خارج المكتب مثل: مراجعة الجهات الحكومية، تسليم المستندات، زيارة العملاء، متابعة المحاكم.",
      },
      {
        question: "كيف أضيف مهمة ميدانية؟",
        answer: "اذهب لصفحة المهام الميدانية واضغط 'إضافة مهمة'. حدد النوع والموظف المكلف وتاريخ الاستحقاق.",
      },
      {
        question: "كيف أؤكد إنجاز المهمة؟",
        answer: "بعد إتمام المهمة، اضغط على 'تأكيد الإنجاز' وأضف أي ملاحظات أو مرفقات إثبات.",
      },
    ],
  },
  {
    id: "roles",
    title: "الأدوار والصلاحيات",
    icon: <Shield className="h-5 w-5" />,
    description: "فهم نظام الصلاحيات والأدوار",
    topics: [
      {
        question: "ما هي الأدوار المتاحة؟",
        answer: "النظام يدعم 10 أدوار: مدير الفرع، رئيس مراجعة القضايا، رئيس مراجعة الاستشارات، رئيس القسم، الدعم الإداري، الموظف، وغيرها.",
      },
      {
        question: "ما صلاحيات مدير الفرع؟",
        answer: "مدير الفرع لديه صلاحيات كاملة على النظام بما في ذلك: إدارة المستخدمين، جميع الأقسام، الإعدادات، والتقارير.",
      },
      {
        question: "ما صلاحيات رئيس القسم؟",
        answer: "رئيس القسم يدير قسمه فقط: إسناد القضايا للمحامين، مراجعة العمل، إضافة المهام الميدانية لفريقه.",
      },
    ],
  },
  {
    id: "settings",
    title: "الإعدادات",
    icon: <Settings className="h-5 w-5" />,
    description: "تخصيص النظام حسب احتياجاتك",
    topics: [
      {
        question: "كيف أخصص لوحة التحكم؟",
        answer: "اذهب لإعدادات لوحة التحكم من القائمة الجانبية. يمكنك إظهار أو إخفاء الويدجات وتغيير أحجامها.",
      },
      {
        question: "كيف أغير الوضع الداكن؟",
        answer: "اضغط على أيقونة الشمس/القمر في شريط الرأس للتبديل بين الوضع الفاتح والداكن.",
      },
      {
        question: "هل يمكنني تغيير كلمة المرور؟",
        answer: "نعم، تواصل مع مدير النظام لتغيير كلمة المرور الخاصة بك.",
      },
    ],
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = helpSections.filter(section => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      section.title.toLowerCase().includes(query) ||
      section.description.toLowerCase().includes(query) ||
      section.topics.some(
        topic =>
          topic.question.toLowerCase().includes(query) ||
          topic.answer.toLowerCase().includes(query)
      )
    );
  });

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            مركز المساعدة
          </h1>
          <p className="text-muted-foreground">
            إجابات على الأسئلة الشائعة ودليل استخدام النظام
          </p>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ابحث في المساعدة..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
          data-testid="input-help-search"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {helpSections.slice(0, 4).map((section) => (
          <Card 
            key={section.id} 
            className="hover-elevate cursor-pointer"
            onClick={() => {
              const element = document.getElementById(section.id);
              element?.scrollIntoView({ behavior: "smooth" });
            }}
            data-testid={`card-help-${section.id}`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {section.icon}
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{section.description}</p>
              <Badge variant="secondary" className="mt-2">
                {section.topics.length} موضوع
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        {filteredSections.map((section) => (
          <Card key={section.id} id={section.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {section.icon}
                {section.title}
              </CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {section.topics.map((topic, index) => (
                  <AccordionItem 
                    key={index} 
                    value={`${section.id}-${index}`}
                    data-testid={`accordion-${section.id}-${index}`}
                  >
                    <AccordionTrigger className="text-right">
                      {topic.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {topic.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}

        {filteredSections.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">لا توجد نتائج للبحث</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            الجولة التعريفية
          </CardTitle>
          <CardDescription>تعرف على أقسام النظام من خلال جولة تفاعلية</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            إذا كنت جديداً على النظام أو تريد مراجعة الأقسام الرئيسية، يمكنك إعادة الجولة التعريفية.
          </p>
          <TourRestartButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تحتاج مساعدة إضافية؟</CardTitle>
          <CardDescription>إذا لم تجد إجابة لسؤالك، تواصل مع الدعم الفني</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>البريد الإلكتروني:</span>
              <span className="text-foreground">support@awn-law.com</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>الهاتف:</span>
              <span className="text-foreground" dir="ltr">+966 XX XXX XXXX</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
