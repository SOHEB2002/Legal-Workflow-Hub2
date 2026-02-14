import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { loginSchema, type LoginInput } from "@shared/schema";
import logoImage from "@assets/WhatsApp_Image_2026-02-13_at_2.24.30_PM_1770981889395.jpeg";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const result = await login(data.username, data.password);
      if (result.success) {
        if (result.mustChangePassword) {
          toast({
            title: "يجب تغيير كلمة المرور",
            description: "يرجى تعيين كلمة مرور جديدة للمتابعة",
          });
        } else {
          toast({
            title: "تم تسجيل الدخول بنجاح",
            description: "مرحباً بك في نظام شركة عون للمحاماة",
          });
          setLocation("/");
        }
      } else {
        toast({
          variant: "destructive",
          title: "خطأ في تسجيل الدخول",
          description: "اسم المستخدم أو كلمة المرور غير صحيحة",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "حدث خطأ أثناء تسجيل الدخول",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-background to-primary/5 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-border/50 shadow-sm bg-white">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <img 
              src={logoImage} 
              alt="شركة العون للمحاماة والاستشارات القانونية" 
              className="h-32 w-auto object-contain mx-auto"
            />
          </div>
          <CardDescription className="text-muted-foreground mt-2">
            قم بتسجيل الدخول للوصول إلى لوحة التحكم
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">اسم المستخدم</FormLabel>
                    <FormControl>
                      <SmartInput
                        inputType="code"
                        data-testid="input-username"
                        placeholder="أدخل اسم المستخدم"
                        className="bg-background border-input focus:border-accent"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">كلمة المرور</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          data-testid="input-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="أدخل كلمة المرور"
                          className="bg-background border-input focus:border-accent pl-10"
                          {...field}
                        />
                        <button
                          type="button"
                          data-testid="button-toggle-password"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                data-testid="button-login"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
              </Button>
            </form>
          </Form>

        </CardContent>
      </Card>
    </div>
  );
}
