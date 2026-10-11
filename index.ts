export interface Recipe {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  prep_required: boolean;
  prep_instruction?: string;
  prep_lead_hours: number;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface DailyPlan {
  day: string;
  meals: Record<MealType, Recipe | null>;
}