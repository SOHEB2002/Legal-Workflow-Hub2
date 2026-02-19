import { useState, useEffect, createContext, useContext } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  LayoutDashboard, 
  Briefcase, 
  MessageSquare, 
  Users, 
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  SkipForward
} from "lucide-react";

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path?: string;
  position: "center" | "bottom-right";
}

const tourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "مرحباً بك في نظام إدارة مكتب المحاماة",
    description: "هذا النظام يساعدك على إدارة القضايا والاستشارات والعملاء والجلسات بكفاءة عالية. دعنا نأخذك في جولة سريعة للتعرف على أهم الميزات.",
    icon: <Play className="h-8 w-8" />,
    position: "center",
  },
  {
    id: "dashboard",
    title: "لوحة التحكم",
    description: "هذه هي الصفحة الرئيسية التي تعرض لك ملخصاً سريعاً لجميع الأنشطة والإحصائيات. يمكنك تخصيص العناصر المعروضة حسب احتياجاتك.",
    icon: <LayoutDashboard className="h-6 w-6" />,
    path: "/",
    position: "bottom-right",
  },
  {
    id: "cases",
    title: "إدارة القضايا",
    description: "من هنا يمكنك إضافة ومتابعة جميع القضايا. تمر كل قضية بـ 9 مراحل من الاستلام حتى الإغلاق. يمكنك تتبع تقدم كل قضية بسهولة.",
    icon: <Briefcase className="h-6 w-6" />,
    path: "/cases",
    position: "bottom-right",
  },
  {
    id: "consultations",
    title: "الاستشارات القانونية",
    description: "سجل واستعرض جميع الاستشارات القانونية المقدمة للعملاء. يمكنك تتبع حالة كل استشارة وربطها بالعميل المناسب.",
    icon: <MessageSquare className="h-6 w-6" />,
    path: "/consultations",
    position: "bottom-right",
  },
  {
    id: "clients",
    title: "إدارة العملاء",
    description: "احتفظ بسجل كامل لجميع العملاء سواء أفراد أو شركات. يمكنك تتبع التواصل معهم وربطهم بالقضايا والاستشارات.",
    icon: <Users className="h-6 w-6" />,
    path: "/clients",
    position: "bottom-right",
  },
  {
    id: "hearings",
    title: "جدول الجلسات",
    description: "تابع جميع الجلسات القادمة والمنتهية. احصل على تنبيهات للجلسات القريبة ولا تفوت أي موعد مهم.",
    icon: <Calendar className="h-6 w-6" />,
    path: "/hearings",
    position: "bottom-right",
  },
  {
    id: "complete",
    title: "أنت جاهز الآن!",
    description: "لقد تعرفت على أهم أقسام النظام. يمكنك دائماً العودة لمركز المساعدة للحصول على مزيد من المعلومات. استخدم Ctrl+K للبحث السريع و Ctrl+/ لعرض اختصارات لوحة المفاتيح.",
    icon: <Play className="h-8 w-8" />,
    position: "center",
  },
];

interface OnboardingContextType {
  isOnboarding: boolean;
  currentStep: number;
  startTour: () => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  showTourOnFirstLogin: boolean;
  setShowTourOnFirstLogin: (show: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showTourOnFirstLogin, setShowTourOnFirstLogin] = useState(true);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const hasSeenTour = localStorage.getItem("lawfirm_tour_completed");
    if (!hasSeenTour && showTourOnFirstLogin) {
      const timer = setTimeout(() => {
        setIsOnboarding(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [showTourOnFirstLogin, user]);

  const startTour = () => {
    setCurrentStep(0);
    setIsOnboarding(true);
  };

  const endTour = () => {
    setIsOnboarding(false);
    setCurrentStep(0);
    localStorage.setItem("lawfirm_tour_completed", "true");
  };

  const nextStep = () => {
    if (currentStep < tourSteps.length - 1) {
      const nextStepIndex = currentStep + 1;
      setCurrentStep(nextStepIndex);
      const step = tourSteps[nextStepIndex];
      if (step.path) {
        setLocation(step.path);
      }
    } else {
      endTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      setCurrentStep(prevStepIndex);
      const step = tourSteps[prevStepIndex];
      if (step.path) {
        setLocation(step.path);
      }
    }
  };

  const skipTour = () => {
    endTour();
  };

  return (
    <OnboardingContext.Provider
      value={{
        isOnboarding,
        currentStep,
        startTour,
        endTour,
        nextStep,
        prevStep,
        skipTour,
        showTourOnFirstLogin,
        setShowTourOnFirstLogin,
      }}
    >
      {children}
      {isOnboarding && <OnboardingOverlay />}
    </OnboardingContext.Provider>
  );
}

function OnboardingOverlay() {
  const { currentStep, nextStep, prevStep, skipTour, endTour } = useOnboarding();
  const step = tourSteps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === tourSteps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" dir="rtl">
      <Card className={`w-full max-w-md mx-4 shadow-2xl ${step.position === "center" ? "" : "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96"}`}>
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-2"
            onClick={skipTour}
            data-testid="button-close-tour"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              {step.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{step.title}</CardTitle>
              <CardDescription className="mt-1">
                الخطوة {currentStep + 1} من {tourSteps.length}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{step.description}</p>
          <div className="flex justify-center gap-1 mt-4">
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === currentStep
                    ? "w-6 bg-primary"
                    : index < currentStep
                    ? "w-1.5 bg-primary/50"
                    : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-2">
          {isFirst ? (
            <Button variant="outline" onClick={skipTour} data-testid="button-skip-tour">
              <SkipForward className="h-4 w-4 ml-2" />
              تخطي الجولة
            </Button>
          ) : (
            <Button variant="outline" onClick={prevStep} data-testid="button-prev-step">
              <ChevronRight className="h-4 w-4 ml-2" />
              السابق
            </Button>
          )}
          {isLast ? (
            <Button onClick={endTour} data-testid="button-finish-tour">
              ابدأ استخدام النظام
            </Button>
          ) : (
            <Button onClick={nextStep} data-testid="button-next-step">
              التالي
              <ChevronLeft className="h-4 w-4 mr-2" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

export function TourRestartButton() {
  const { startTour } = useOnboarding();
  
  return (
    <Button variant="outline" onClick={startTour} data-testid="button-restart-tour">
      <Play className="h-4 w-4 ml-2" />
      إعادة الجولة التعريفية
    </Button>
  );
}
