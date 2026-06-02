import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface ComingSoonPlaceholderProps {
  pageTitle?: string;
}

export function ComingSoonPlaceholder({ pageTitle }: ComingSoonPlaceholderProps) {
  return (
    <div className="h-full flex items-center justify-center p-6" dir="rtl">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 py-12 px-6 text-center">
          <div className="rounded-full bg-muted p-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          {pageTitle && (
            <h1
              className="text-2xl font-bold text-foreground"
              data-testid="text-page-title"
            >
              {pageTitle}
            </h1>
          )}
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">
              هذه الصفحة قيد التطوير
            </p>
            <p className="text-sm text-muted-foreground">
              ستتوفر قريباً
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
