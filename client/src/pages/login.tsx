import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Scale, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { loginSchema, type LoginInput } from "@shared/schema";

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
      const success = await login(data.username, data.password);
      if (success) {
        toast({
          title: "تم تسجيل الدخول بنجاح",
          description: "مرحباً بك في نظام إدارة مكتب المحاماة",
        });
        setLocation("/");
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-border/50 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-lg">
            <Scale className="w-8 h-8 text-accent-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            نظام إدارة مكتب المحاماة
          </CardTitle>
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
                      <Input
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

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground text-center mb-3">بيانات الدخول التجريبية:</p>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
                <span className="text-muted-foreground">المحامي عمر (مسؤول)</span>
                <code className="text-accent">omar / 1234</code>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
                <span className="text-muted-foreground">المحامي مهند (مسؤول)</span>
                <code className="text-accent">muhannad / 1234</code>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
                <span className="text-muted-foreground">السكرتير</span>
                <code className="text-accent">secretary / 1234</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
