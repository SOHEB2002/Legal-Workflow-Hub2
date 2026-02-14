import { forwardRef, useCallback } from "react";
import { Input } from "@/components/ui/input";

interface SmartInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  inputType?: "text" | "numeric" | "email" | "phone" | "code";
}

export const SmartInput = forwardRef<HTMLInputElement, SmartInputProps>(
  function SmartInput({ inputType = "text", className = "", ...props }, ref) {
    const getDirection = useCallback(() => {
      switch (inputType) {
        case "numeric":
        case "email":
        case "phone":
        case "code":
          return "ltr" as const;
        default:
          return undefined;
      }
    }, [inputType]);

    const getTextAlign = useCallback(() => {
      switch (inputType) {
        case "numeric":
        case "email":
        case "phone":
        case "code":
          return "left" as const;
        default:
          return "right" as const;
      }
    }, [inputType]);

    return (
      <Input
        ref={ref}
        {...props}
        dir={getDirection()}
        className={className}
        style={{
          ...props.style,
          textAlign: getTextAlign(),
          unicodeBidi: inputType === "text" ? "plaintext" : "embed",
        }}
      />
    );
  }
);
