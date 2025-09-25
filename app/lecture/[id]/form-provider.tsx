"use client";

import { ReactNode } from 'react';
import { FormContext } from '@/lib/hooks/use-form-context';

interface FormProviderProps {
  children: ReactNode;
  formData: Record<string, any>;
  onFieldChange: (name: string, value: string) => void;
}

export function FormProvider({ children, formData, onFieldChange }: FormProviderProps) {
  return (
    <FormContext.Provider value={{ formData, handleFieldChange: onFieldChange }}>
      {children}
    </FormContext.Provider>
  );
}