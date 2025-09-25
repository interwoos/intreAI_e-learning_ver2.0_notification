import { createContext, useContext } from 'react';

interface FormContextType {
  formData: Record<string, any>;
  handleFieldChange: (name: string, value: string) => void;
}

export const FormContext = createContext<FormContextType>({
  formData: {},
  handleFieldChange: () => {},
});

export const useFormContext = () => {
  const context = useContext(FormContext);
  if (context === undefined) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
};