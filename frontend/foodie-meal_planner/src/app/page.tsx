'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
// @ts-ignore
import AppInfoModal from '../components/AppInfoModal';
import NotificationManager from '../components/NotificationManager';
import { CalendarDays, Utensils, Menu, ChevronLeft, ChevronRight, Timer, Plus,
         ShoppingCart, Check, X, Send, CalendarPlus,
         CheckCircle2, RefreshCw, UtensilsCrossed,
         Edit, AlarmClock, InfoIcon, Copy,
         ChefHat,
         Clock,
         Activity,
         Sparkles,
         Download,
} from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CUISINE_OPTIONS = ['South Indian', 'North Indian', 'Continental/English', 'Asian Fusion', 'Mediterranean', 'Mexican'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'];

interface MealPlan {
  id?: string;
  day_of_week: string;
  meal_type: string;
  title: string;
  description?: string;
  prep_required?: boolean;
  image_url?: string;
  prep_completed?: boolean;
  prep_instruction?: any; // Can be a JSON object or string
  calorie_info?: string;
  balanced_advice?: string;
  alternative_dish?: string;
}


// Map common dish keywords to guaranteed high-res images
const SPECIFIC_DISH_IMAGES: Record<string, string> = {
  dosa: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=500&auto=format&fit=crop',
  masala_dosa: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=500&auto=format&fit=crop',
  idli: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop',
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop',
  pancakes: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500&auto=format&fit=crop',
  pasta: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281318?w=500&auto=format&fit=crop',
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop',
  appam: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500&auto=format&fit=crop',
};

function getCorrespondingDishImage(dishTitle: string): string {
  const lower = dishTitle.trim().toLowerCase();
  
  for (const keyword of Object.keys(SPECIFIC_DISH_IMAGES)) {
    if (lower.includes(keyword)) {
      return SPECIFIC_DISH_IMAGES[keyword];
    }
  }

  // Fallback to keyword-based search query
  return `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80`;
}

// Helper function to calculate current week's Monday date (YYYY-MM-DD)
function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMonday = (dayOfWeek + 6) % 7;

  const monday = new Date(today);
  monday.setDate(today.getDate() - distanceToMonday);

  return monday.toISOString().split('T')[0]; // Returns "2026-10-05"
}

export default function MealPlannerPage() {
  // Helper to get today's full day name
const getCurrentDayName = () => {
  const options: Intl.DateTimeFormatOptions = { weekday: 'short' }; // returns "Monday", "Thursday", etc.
  return new Intl.DateTimeFormat('en-US', options).format(new Date());
};
  const [selectedDay, setSelectedDay] = useState(getCurrentDayName());
  const [weeklyPlans, setWeeklyPlans] = useState<MealPlan[]>([]);
  const [prepTasks, setPrepTasks] = useState<any[]>([]);
  const [activeAlertTask, setActiveAlertTask] = useState<any>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  // Modals state
  const [showPrefModal, setShowPrefModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [activeSlot, setActiveSlot] = useState<string>('Lunch');

  // Preference Form State
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(['South Indian', 'Continental/English']);
  const [enabledMeals, setEnabledMeals] = useState<string[]>(['Breakfast', 'Lunch', 'Dinner']);
  const [dietary, setDietary] = useState('Non-Vegetarian');

  // Custom Dish Input State
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customPrep, setCustomPrep] = useState(false);

  // State additions
const [chatInput, setChatInput] = useState('');
const [chatMessages, setChatMessages] = useState<any[]>([
  { sender: 'ai', text: 'Hello! Ask me anything about your meals, request a grocery list, or ask me to modify your plan.' }
]);
const [savedGroceryList, setSavedGroceryList] = useState<any>(null);

const [isCopilotOpen, setIsCopilotOpen] = useState(false);

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// Helper function to format any Monday date string into a clean display range
const getFormattedWeekRange = (mondayDateStr: string) => {
  const monday = new Date(mondayDateStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const mondayStr = monday.toLocaleDateString('en-US', formatOptions);
  const sundayStr = sunday.toLocaleDateString('en-US', formatOptions);
  const yearStr = monday.getFullYear();

  return `Week of ${mondayStr} – ${sundayStr}, ${yearStr}`;
};

  // Generate or retrieve persistent user context
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
      }
      setLoading(false);
    });

    // 2. Listen for login/logout events dynamically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
      } else {
        setUserId(null);
        setUserEmail(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 3. Trigger Google OAuth popup/redirect
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin, // Redirects back to your app after login
      },
    });
    if (error) console.error('Google login error:', error.message);
  };

  // 4. Logout handler
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const [isDesktopApp, setIsDesktopApp] = useState(false);

  useEffect(() => {
    // Check if running inside the Tauri native desktop wrapper
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    setIsDesktopApp(isTauri);
  }, []);
  
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // 1. Check if the app is already running as an installed PWA / Standalone window
    const checkIsStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as any).standalone || // iOS Safari check
        document.referrer.includes("android-app://"); // Android TWA check

      setIsStandalone(isStandaloneMode);
    };

    checkIsStandalone();

    // 2. Listen for the browser install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Hide button if installed during active session
    window.addEventListener("appinstalled", () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // 3. DO NOT RENDER the button if already running inside the installed app
  if (isStandalone) {
    return null; 
  }

  // Simple inline install logic inside your component
const handlePwaInstall = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  } else {
    // Helpful fallback for iOS Safari or browsers without prompt support
    alert("To install: Tap your browser menu (or Share button on iOS) and select 'Add to Home Screen'.");
  }
};

// Helper to get Monday of any date's week
const getMondayOfDate = (d = new Date()) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  return new Date(date.setDate(diff)).toISOString().split('T')[0];
};

// State for active week
const [currentWeekStart, setCurrentWeekStart] = useState(getMondayOfDate());
// Dynamically update the header text whenever currentWeekStart changes
const weekRangeText = getFormattedWeekRange(currentWeekStart);
// Handler to shift weeks (Prev / Next)
const handleShiftWeek = (direction: 'prev' | 'next') => {
  const current = new Date(currentWeekStart);
  current.setDate(current.getDate() + (direction === 'next' ? 7 : -7));
  setCurrentWeekStart(getMondayOfDate(current));
};

// Robust fetch function that handles both array or { plans: [...] } responses
const fetchWeeklyPlans = async () => {
  if (!userId) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/weekly-plans?user_id=${userId}&week_start_date=${currentWeekStart}`);
    const data = await res.json();
    
    // 👇 Safely extract array regardless of whether backend returns direct array or wrapped object
    const plansArray = Array.isArray(data) ? data : (data.plans || data.data || []);
    setWeeklyPlans(plansArray);
  } catch (err) {
    console.error('Fetch error:', err);
  }
};

// 1. Fetch weekly plans when week changes
useEffect(() => {
  if (!userId) return;
  fetchWeeklyPlans(); // 👈 Re-use the robust fetch helper here!
}, [userId, currentWeekStart]);
  

  const toggleCuisine = (cuisine: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    );
  };

  const toggleMealSlot = (slot: string) => {
    setEnabledMeals((prev) =>
      prev.includes(slot) ? prev.filter((m) => m !== slot) : [...prev, slot]
    );
  };

 // 3. Save Custom Meal and Refresh Display
  const handleSaveCustomMeal = () => {
    if (!customTitle.trim()) return;

    const dynamicImageUrl = getCorrespondingDishImage(customTitle.trim());

    fetch(`${API_BASE_URL}/api/menu/custom-slot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        week_start_date: currentWeekStart, // 👈 Make sure to pass current week start too!
        day: selectedDay,
        meal_type: activeSlot,
        recipe_title: customTitle,
        description: customDesc,
        prep_required: customPrep,
        image_url: dynamicImageUrl
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && data.updated_meal && data.updated_meal.length > 0) {
          const savedMealRecord = data.updated_meal[0];

          // Optimistically update local UI state using the server record containing AI prep steps
          setWeeklyPlans((prev) => {
            const filtered = prev.filter(
              (p) => !(p.day_of_week === selectedDay && p.meal_type === activeSlot)
            );
            return [...filtered, savedMealRecord];
          });
        }

        setShowCustomModal(false);
        setCustomTitle('');
        setCustomDesc('');
        setCustomPrep(false);
      })
      .catch((err) => console.error('Error saving custom meal:', err));
  };

  // Helper function to find added dish for a given day and slot
  const getMealForSlot = (day: string, slot: string): MealPlan | undefined => {
    return weeklyPlans.find(
      (plan) => plan.day_of_week === day && plan.meal_type === slot
    );
  };

  const handleSyncToCalendar = async (plan: MealPlan) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/calendar/generate-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: plan.title,
        description: plan.description || `Prepare ingredients for ${plan.title} (${plan.meal_type})`,
        target_day: plan.day_of_week,
        week_start_date: getMondayOfCurrentWeek(),
      }),
    });

    const data = await response.json();

    if (data.google_calendar_url) {
      // Opens Google Calendar event creation in a new browser tab
      window.open(data.google_calendar_url, '_blank', 'noopener,noreferrer');
    }
  } catch (err) {
    console.error('Failed to generate calendar link:', err);
  }
};

const handleAutoGenerateMenu = async () => {
  if (!userId) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/menu/auto-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        week_start_date: getMondayOfCurrentWeek(),
      }),
    });

    const data = await response.json();
    if (data.status === 'success') {
      // Reload weekly plans to reflect newly generated menu immediately
      fetchWeeklyPlans();
    }
  } catch (err) {
    console.error('Failed to auto-generate menu:', err);
  }
};

// 2. Fetch saved grocery list when week changes
useEffect(() => {
  if (!userId) return;
  fetch(`${API_BASE_URL}/api/grocery/get?user_id=${userId}&week_start_date=${currentWeekStart}`)
    .then(res => res.json())
    .then(data => { if (data && data.items) setSavedGroceryList(data); else setSavedGroceryList(null); })
    .catch(err => console.error("Grocery fetch error:", err));
}, [userId, currentWeekStart]);

// Handle Copilot Chat Submission
const handleSendCopilotMessage = async () => {
  if (!chatInput.trim() || !userId) return;
  const userMsg = chatInput;
  setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
  setChatInput('');

  try {
    const res = await fetch(`${API_BASE_URL}/api/copilot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, message: userMsg, week_start_date: getMondayOfCurrentWeek() })
    });
    const data = await res.json();
    setChatMessages(prev => [...prev, { sender: 'ai', text: data.response_text, action_performed: data.action_performed,
      data: data.data}]);
    
    // Refresh grocery list if generated
    if (data.action_performed === 'grocery_generated' && data.data) {
      setSavedGroceryList(data.data);
    }
  } catch (err) {
    console.error("Chat error:", err);
  }
};

// Handle Prep Completion Toggle
const handleTogglePrepDone = async (plan: any, currentStatus: boolean) => {
  try {
    await fetch(`${API_BASE_URL}/api/prep/toggle-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        day_of_week: plan.day_of_week,
        meal_type: plan.meal_type,
        week_start_date: getMondayOfCurrentWeek(),
        prep_completed: !currentStatus
      })
    });
    fetchWeeklyPlans(); // Reload plans
  } catch (err) {
    console.error("Prep toggle error:", err);
  }
};

// 1. Fetch Today's Un-triggered Tasks & Request Notification Permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    fetchTodayPrepTasks();
  }, [userId]);

  const fetchTodayPrepTasks = async () => {
    const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    const { data, error } = await supabase
      .from('user_prep_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('reminder_date', todayStr)
      .eq('triggered', false)
      .eq('completed', false);

    if (error) {
      console.error('Error fetching user prep tasks:', error);
    } else if (data) {
      setPrepTasks(data);
    }
  };

  // 2. Background Timer Interval (Checks Every 30 Seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      // Format current time to match "HH:mm" (24-hour format)
      const currentTimeString = now.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      }); 

      prepTasks.forEach(async (task) => {
        // task.reminder_time from Postgres is usually "20:00:00", match the first 5 chars ("20:00")
        const taskTimeFormatted = task.reminder_time ? task.reminder_time.slice(0, 5) : '20:00';

        if (taskTimeFormatted === currentTimeString && !task.triggered) {
          
          // A. Set Active Visual Banner Alert
          setActiveAlertTask(task);

          // B. Play Audio Alarm Sound
          try {
            const audio = new Audio('../alarm.mp3');
            audio.play();
          } catch (err) {
            console.log("Audio play blocked by browser interaction policy:", err);
          }

          // C. Trigger Web Push Notification
          if (typeof window !== 'undefined' && Notification.permission === 'granted') {
            new Notification('🍳 Foodie Prep Alert', {
              body: `${task.title}${task.description ? `: ${task.description}` : ''}`,
              icon: '/icon.png',
            });
          }

          // D. Mark as triggered in Supabase
          await supabase
            .from('user_prep_tasks')
            .update({ triggered: true })
            .eq('id', task.id);

          // E. Remove from active local queue
          setPrepTasks(prev => prev.filter(t => t.id !== task.id));
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [prepTasks]);

  // 3. Mark Task as Complete when user clicks "Got it / Done"
  const handleCompleteTask = async (taskId: number) => {
    setActiveAlertTask(null);
    await supabase
      .from('user_prep_tasks')
      .update({ completed: true })
      .eq('id', taskId);
  };

// Handle Grocery Item Toggle (Mark as bought)
const handleToggleGroceryItem = async (index: number, currentBought: boolean) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/grocery/toggle-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        week_start_date: getMondayOfCurrentWeek(),
        item_index: index,
        is_bought: !currentBought
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      // Refresh grocery list
      const fresh = await fetch(`${API_BASE_URL}/api/grocery/get?user_id=${userId}&week_start_date=${getMondayOfCurrentWeek()}`).then(r => r.json());
      setSavedGroceryList(fresh);
    }
  } catch (err) {
    console.error("Grocery toggle error:", err);
  }
};

// Handler to switch the current dish to the AI-suggested alternative
  const handleSwitchToAlternative = async (alternativeTitle: string, day: string, mealType: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/menu/custom-slot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId, // Ensure you have your active user ID here
          day: day,
          meal_type: mealType,
          recipe_title: alternativeTitle,
          description: `Healthy alternative swap for ${mealType}`,
          week_start_date: currentWeekStart,
          prep_required: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to switch meal alternative');
      }

      // Refresh weekly plans to display the newly switched dish
      fetchWeeklyPlans();
    } catch (err) {
      console.error('Error switching to alternative dish:', err);
      alert('Could not switch dish. Please try again.');
    }
  };
  
  // Helper inside your Chat Message Component
const handleCopyToClipboard = (groceryData: { title?: string; items?: { name: string }[] } | null | undefined) => {
  if (!groceryData || !groceryData.items) return;
  
  const textTitle = groceryData.title || "Grocery List";
  const textItems = groceryData.items.map(i => `- [ ] ${i.name}`).join('\n');
  const fullText = `${textTitle}\n\n${textItems}`;

  navigator.clipboard.writeText(fullText).then(() => {
    alert("Grocery list copied to clipboard! You can now paste it directly into Evernote or Google Keep.");
  });
};

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading Foodie...</div>;
  }
  // 👇 Show Login Screen if user is not authenticated
if (!userId) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-amber-50/50 px-4 py-8">
      {/* Added 'relative' to allow absolute positioning inside the card */}
      <div className="relative w-full max-w-md rounded-3xl bg-white p-8 sm:p-10 shadow-xl border border-amber-200/60 text-center space-y-6">
        <div className="hidden md:block absolute top-5 right-5">
        <button
        onClick={handlePwaInstall}
        className="md:hidden inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-full text-xs font-medium transition shadow-sm"
      >
        <Download className="w-4 h-4" />
        <span>Install App</span>
      </button>
      </div>
        {/* 👇 Top-Right Download Button (Hidden on Tauri & Hidden on Mobile Phones) */}
        {!isDesktopApp && (
          <div className="hidden md:block absolute top-5 right-5">
            <a
              href="https://fjczdvbumeroarymknxu.supabase.co/storage/v1/object/public/Installers/foodie-meal_planner_0.1.0_x64_en-US.msi"
              download
              className="inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-full text-xs font-medium transition shadow-sm"
              title="Download Desktop App"
            >
              <span>< Download className="w-4 h-4 sm:w-4.5 sm:h-4.5"/></span> Download App
            </a>
          </div>
        )}

        {/* 👇 Brand Header Logo (Full version) */}
        <div className="flex justify-center pt-4">
          <img 
            src="../logo.png" 
            alt="Foodie Logo" 
            className="h-full object-contain" 
          />
        </div> 

        {/* Title & Description */}
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-amber-950 mb-2">
            Welcome to Foodie
            {/* Info Button trigger */}
            <button 
              onClick={() => setIsInfoOpen(true)}
              className="text-amber-300 hover:text-black bg-white hover:bg-amber-800 p-1 rounded-full text-xs transition ml-2"
              title="App Capabilities & Info"
            >
              <InfoIcon className="w-5 h-5 sm:w-5.5 sm:h-5.5 inline"/>
            </button>
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-xs mx-auto">
            Your autonomous zero-effort meal planning assistant.
          </p>
        </div>

        {/* Render Modal */}
        <AppInfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />

        {/* Sign In Action */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-3.5 text-sm font-semibold text-stone-800 shadow-sm hover:bg-amber-50/80 hover:border-amber-300 transition-all active:scale-[0.98]"
        >
          {/* Google G Logo SVG */}
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        <p className="text-[11px] text-stone-400">
          By continuing, you agree to organize your meals stress-free.
        </p>
      </div>
    </main>
  );
}
  
  return (
    <div className="w-full min-h-screen bg-amber-50/30 text-stone-900 pb-12">

      {/* Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Top Header Bar */}
<header className="p-4 sm:p-6 bg-amber-900 text-amber-50 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
  
  {/* Title & Date Info */}
  <div className="flex items-center gap-3">
    {/* 👇 Logo Icon placement */}
    <div className="bg-amber-100 p-2.5 rounded-2xl border border-amber-300/30 shadow-inner shrink-0">
      <img 
        src="../favicon.ico" 
        alt="Foodie Icon" 
        className="w-9 h-9 sm:w-11 sm:h-11 object-contain" 
      />
    </div>

    <div>
      {/* Category Row with Title Tag, Info Button, and Download Button */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
          Foodie Meal Planner
        </span>

        {/* Info Button trigger */}
        <button 
          onClick={() => setIsInfoOpen(true)}
          className="text-amber-300 hover:text-white bg-amber-800/60 hover:bg-amber-800 p-1 rounded-full text-xs transition"
          title="App Capabilities & Info"
        >
          <InfoIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5"/>
        </button>

        {/* 👇 Download Button (Only on Web Desktop, Hidden in Tauri & Mobile) */}
         {!isDesktopApp && ( 
          <a
            href="https://fjczdvbumeroarymknxu.supabase.co/storage/v1/object/public/Installers/foodie-meal_planner_0.1.0_x64_en-US.msi"
            download
            className="hidden md:inline-flex items-center gap-1.5 bg-amber-800/80 hover:bg-amber-700 text-amber-100 hover:text-white px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-600/50 transition shadow-sm"
            title="Download Windows Desktop App"
          >
            <Download className="w-3.5 h-3.5 text-amber-300" />
            
          </a>
         )}
      </div>

      <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-wide mt-0.5">Craving Plan</h1>
      <p className="text-xs text-amber-200/80 mt-0.5">{weekRangeText || 'Loading current week...'}</p>
    </div>
  </div>

  {/* Actions Toolbar: Stacks 1-per-row on Mobile, Rows on Desktop */}
  <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
    
    {/* Active Schedule Pill */}
    <div className="bg-amber-800/80 px-3.5 py-2 rounded-xl border border-amber-700/50 text-center w-full sm:w-auto shrink-0">
      <span className="block text-[10px] uppercase text-amber-300 font-semibold">Active Schedule</span>
      <span className="text-xs font-bold text-amber-100">
        {weeklyPlans.length} / {enabledMeals.length * 7} Meals
      </span>
    </div>

    {/* Food Preferences Button */}
    <button 
      onClick={() => setShowPrefModal(true)}
      className="bg-amber-800/90 hover:bg-amber-700 border border-amber-600/50 text-amber-100 px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 w-full sm:w-auto shrink-0"
    >
      <Utensils className="w-4 h-4" />
      <span>Food Preferences</span>
    </button>

    {/* Generate Menu Button */}
    <button 
      onClick={handleAutoGenerateMenu}
      className="bg-amber-500 hover:bg-amber-400 text-amber-950 px-4 py-2.5 sm:py-2 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 w-full sm:w-auto shrink-0"
    >
      <Menu className="w-4 h-4" />
      <span>Generate Menu</span>
    </button>

    {/* Logged-In User Info & Logout Button */}
    <div className="flex items-center justify-between gap-3 bg-amber-950/50 px-3.5 py-2 rounded-xl border border-amber-700/40 w-full sm:w-auto min-w-0">
      <div className="text-left min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold">Signed in</span>
        <span className="text-xs font-medium text-amber-100 truncate block max-w-[200px] sm:max-w-xs md:max-w-none" title={userEmail || ''}>
          {userEmail || 'User'}
        </span>
      </div>
      <button 
        onClick={handleLogout}
        className="bg-amber-900/80 hover:bg-red-900/80 text-amber-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border border-amber-700/60 shrink-0"
        title="Sign Out"
      >
        Logout
      </button>
    </div>

    {/* 🔔 NOTIFICATION MANAGER INTEGRATION */}
    {userId ? (
      <NotificationManager userId={userId} />
    ) : (
      <div className="p-4 bg-gray-50 border rounded-lg mb-4 text-sm text-gray-600">
        Please log in to enable push alarm notifications.
      </div>
    )}
  </div>

  {/* Render Modal */}
  <AppInfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
</header>

        {/* Week Selection & Navigation Bar */}
<div className="bg-white border border-amber-200/60 rounded-2xl p-4 shadow-sm mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
  <div className="flex flex-wrap items-center gap-3">
    <div className="bg-amber-100 p-2.5 rounded-xl text-amber-900 text-lg">
      <CalendarDays className="w-5 h-5" />
    </div>
    <div>
      <h2 className="font-serif font-bold text-amber-950 text-sm">Meal Plan Schedule</h2>
      <p className="text-xs text-stone-500">
        Viewing week of <strong className="text-amber-900">Monday, {currentWeekStart}</strong>
      </p>
    </div>
  </div>

  <div className="flex items-center gap-2">
    <button 
      onClick={() => handleShiftWeek('prev')}
      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
    >
      <ChevronLeft className="w-4 h-4" />Prev Week
    </button>
    
    <button 
      onClick={() => setCurrentWeekStart(getMondayOfDate())}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
        currentWeekStart === getMondayOfDate() 
          ? 'bg-amber-800 text-amber-50 shadow-sm' 
          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
      }`}
    >
      This Week
    </button>

    <button 
      onClick={() => handleShiftWeek('next')}
      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
    >
      
      Next Week <ChevronRight className="w-4 h-4" />
    </button>
  </div>
</div>

{/* ========================================= */}
  {/* 🔔 ACTIVE PREP ALARM BANNER (INSERT HERE) */}
  {/* ========================================= */}
  {activeAlertTask && (
    <div className="mb-6 bg-amber-500 text-amber-950 px-5 py-4 rounded-3xl shadow-xl flex items-center justify-between animate-bounce border-2 border-amber-300">
      <div className="flex items-center gap-3">
        <span className="text-3xl"><AlarmClock /> </span>
        <div>
          <h4 className="font-serif font-bold text-base">Meal Prep Reminder Alert!</h4>
          <p className="text-sm font-semibold">{activeAlertTask.title}</p>
          {activeAlertTask.description && (
            <p className="text-xs text-amber-900">{activeAlertTask.description}</p>
          )}
        </div>
      </div>
      <button 
        onClick={() => handleCompleteTask(activeAlertTask.id)}
        className="bg-amber-950 text-amber-50 px-4 py-2 rounded-2xl text-xs font-semibold hover:bg-amber-900 transition-all shadow-md shrink-0"
      >
        Mark Done / Dismiss
      </button>
    </div>
  )}
        {/* Preferences Summary Pill */}
        <div className="mt-4 bg-white/80 border border-amber-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-amber-900">Active Cuisines:</span>
            {selectedCuisines.map((c) => (
              <span key={c} className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
                {c}
              </span>
            ))}
          </div>
          <span className="text-stone-500 text-[11px]">Diet: <strong>{dietary}</strong></span>
        </div>

        {/* Day Selector */}
        <div className="flex justify-between items-center my-6 gap-2 overflow-x-auto pb-1">
          {DAYS.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`flex-1 min-w-[50px] py-2.5 rounded-xl text-xs font-bold transition-all ${
                selectedDay === day
                  ? 'bg-amber-800 text-amber-50 shadow-md scale-102'
                  : 'bg-white text-stone-600 border border-amber-200/60 hover:bg-amber-100/40'
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-serif font-bold text-stone-800">
                {selectedDay}'s Menu
              </h2>
              <span className="text-xs text-stone-500">
                {enabledMeals.length} Slots Enabled
              </span>
            </div>

            {/* Render Enabled Meal Slots Dynamically */}
            {enabledMeals.map((mealType) => {
              const currentMeal = getMealForSlot(selectedDay, mealType);

              return (
                <div 
                  key={mealType} 
                  className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-amber-200/60 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                        {mealType}
                      </span>
                      {currentMeal?.prep_required && (
                        <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-semibold">
                          Advance Prep Needed
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        setActiveSlot(mealType);
                        if (currentMeal) {
                          setCustomTitle(currentMeal.title);
                          setCustomDesc(currentMeal.description || '');
                          setCustomPrep(currentMeal.prep_required || false);
                        } else {
                          setCustomTitle('');
                          setCustomDesc('');
                          setCustomPrep(false);
                        }
                        setShowCustomModal(true);
                      }}
                      className="text-[11px] font-bold text-amber-800 hover:text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-50 flex items-center gap-2"
                    >
                      {currentMeal ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      <span className="ml-1">Edit Dish</span>
                    </button>
                  </div>

                  {currentMeal ? (
                    <div className="flex flex-col gap-3">
                      {/* Top Row: Image + Dish Title & Description */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <img
                          src={currentMeal.image_url || getCorrespondingDishImage(currentMeal.title)}
                          alt={currentMeal.title}
                          style={{ width: '72px', height: '72px', objectFit: 'cover' }}
                          className="rounded-xl shadow-sm shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif font-bold text-stone-800 text-base">
                            {currentMeal.title}
                          </h3>
                          <p className="text-xs text-stone-600 mt-0.5 line-clamp-2">
                            {currentMeal.description || 'No description provided.'}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Row: 📊 Calorie Breakdown & Balanced Guidance Card */}
                      {currentMeal.calorie_info && (
                        <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-3 space-y-2 text-xs shadow-inner w-full mt-1">
                          {/* Calories / Macros */}
                          <div className="flex items-start gap-2">
                            <span className="text-amber-900 font-bold shrink-0 flex items-center gap-1"> 
                              <Activity className="w-4 h-4 text-amber-800" /> Nutrition:
                            </span>
                            <p className="text-stone-700">{currentMeal.calorie_info}</p>
                          </div>

                          {/* Balanced Eating Tips */}
                          <div className="flex items-start gap-2">
                            <span className="text-amber-900 font-bold shrink-0 flex items-center gap-1"> 
                              <Sparkles className="w-4 h-4 text-amber-800" /> Balanced Way:
                            </span>
                            <p className="text-stone-700">{currentMeal.balanced_advice}</p>
                          </div>

                          {/* Healthy Alternative Switcher */}
                          {currentMeal.alternative_dish && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2.5 mt-1 border-t border-amber-200/50 gap-2">
                              <span className="text-stone-600 text-[11px] truncate max-w-[280px] flex items-center gap-1" title={currentMeal.alternative_dish}>
                                <UtensilsCrossed className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>Healthier Swap: <strong className="text-amber-950">{currentMeal.alternative_dish}</strong></span>
                              </span>
                              <button 
                                onClick={() => handleSwitchToAlternative(currentMeal.alternative_dish!, selectedDay, mealType)}
                                className="bg-amber-800 hover:bg-amber-900 text-amber-50 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-sm shrink-0 flex items-center justify-center gap-1"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> Switch to this
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        setActiveSlot(mealType);
                        setCustomTitle('');
                        setCustomDesc('');
                        setCustomPrep(false);
                        setShowCustomModal(true);
                      }}
                      className="w-full py-4 border-2 border-dashed border-amber-200/80 text-amber-800/70 hover:bg-amber-50/50 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="ml-1">Add {mealType} Dish</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Sidebar Container */}
<div className="space-y-6">

  {/* 1. Dynamic Real-Time Advance Prep Widget */}
  <div className="bg-amber-900/5 border border-amber-200 rounded-2xl p-5 shadow-sm">
    <h3 className="font-serif font-bold text-amber-950 text-sm flex items-center justify-between mb-3">
      <span className="flex items-center gap-2"><Timer className="w-4 h-4" /> Smart Prep Timeline</span>
      <span className="text-[10px] bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-full font-bold">
        Auto-Detected
      </span>
    </h3>

    {weeklyPlans.filter(p => p.prep_required).length > 0 ? (
      <div className="space-y-3">
        {weeklyPlans
          .filter(p => p.prep_required)
          .map((plan, idx) => {
            // Parse dynamic prep steps stored in JSON string or fallback
            let steps = [];
            if (plan.prep_instruction) {
              try {
                steps = typeof plan.prep_instruction === 'string' 
                  ? JSON.parse(plan.prep_instruction) 
                  : plan.prep_instruction;
              } catch (e) {
                steps = [];
              }
            }

            return (
              <div 
                key={idx} 
                className={`rounded-xl p-3.5 border transition-all space-y-2 ${
                  plan.prep_completed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-amber-100 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className={`text-xs font-bold ${plan.prep_completed ? 'line-through text-emerald-800' : 'text-amber-900'}`}>
                      Prep for {plan.day_of_week} {plan.meal_type} ({plan.title})
                    </p>
                    
                    {/* Dynamic Step-by-Step Instructions */}
                    {steps.length > 0 ? (
                      <div className="text-[11px] text-stone-600 space-y-0.5">
                        {steps.map((s: any, sIdx: number) => (
                          <p key={sIdx}>
                            • <strong className="text-amber-900/80">{s.timing}:</strong> {s.action}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-stone-600 leading-snug">
                        {plan.prep_completed ? <CheckCircle2 className="w-4 h-4 inline-block mr-1" /> : <Clock className="w-4 h-4 inline-block mr-1" />}
                        {plan.prep_completed ? 'Prep completed!' : ' Requires advance soaking or fermentation.'}
                      </p>
                    )}
                  </div>

                  {/* Mark as Done Toggle Button */}
                  <button 
                    onClick={() => handleTogglePrepDone(plan, plan.prep_completed ?? false)}
                    className={`text-[10px] px-2 py-1 rounded-lg font-bold shrink-0 transition-all ${
                      plan.prep_completed ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                    }`}
                  >
                    {plan.prep_completed ? <CheckCircle2 className="w-4 h-4 inline-block mr-1" /> : <Check className="w-4 h-4 inline-block mr-1" />}
                    {plan.prep_completed ? 'Done' : 'Mark Done'}
                  </button>
                </div>

                {!plan.prep_completed && (
                  <button 
                    onClick={() => handleSyncToCalendar(plan)}
                    className="w-full mt-1.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-amber-50 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <CalendarPlus className="w-4 h-4" /> Add Reminder to Google Calendar
                  </button>
                )}
              </div>
            );
          })}
      </div>
    ) : (
      <p className="text-xs text-stone-500 italic">
        No advance preparation required for currently scheduled meals.
      </p>
    )}
  </div>

  {/* 2. Interactive Saved Grocery List (Keep Notes Style) */}
  {savedGroceryList && savedGroceryList.items && savedGroceryList.items.length > 0 && (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2">
      <h3 className="font-serif font-bold text-stone-800 text-xs flex items-center justify-between">
        <span><ShoppingCart className="w-4 h-4 inline-block mr-1" /> Saved Grocery List</span>
        <span className="text-[10px] text-stone-500">Keep Notes</span>
      </h3>
      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
        {savedGroceryList.items.map((item: any, idx: number) => (
          <label key={idx} className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer bg-white p-2 rounded-lg border border-stone-100">
            <input 
              type="checkbox" 
              checked={item.bought} 
              onChange={() => handleToggleGroceryItem(idx, item.bought)}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <span className={item.bought ? 'line-through text-stone-400' : ''}>{item.name}</span>
          </label>
        ))}
      </div>
    </div>
  )}

</div>

{/* ========================================================= */}
{/* 3. Floating Bottom-Right AI Copilot Widget & Toggle Button */}
{/* ========================================================= */}
<div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">

  {/* Floating Chat Drawer */}
  {isCopilotOpen && (
    <div className="mb-3 w-80 sm:w-96 bg-gradient-to-br from-amber-800 to-amber-950 text-amber-50 rounded-2xl p-4 shadow-2xl border border-amber-700/50 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex justify-between items-center pb-2 border-b border-amber-700/50">
        <h3 className="font-serif font-bold text-sm flex items-center gap-2">
          <ChefHat className="w-4 h-4" /> Foodie AI Copilot
        </h3>
        <button 
          onClick={() => setIsCopilotOpen(false)}
          className="text-amber-300/80 hover:text-amber-100 font-bold text-sm px-1.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-amber-900/40 rounded-xl p-3 h-64 overflow-y-auto space-y-2.5 text-xs border border-amber-700/40">
        {chatMessages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`p-2.5 rounded-xl ${
              msg.sender === 'user' 
                ? 'bg-amber-700/60 text-right ml-4' 
                : 'bg-amber-950/80 mr-4 border border-amber-800/50'
            }`}
          >
            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            {/* 📋 Copy to Evernote / Notes Button for Grocery Responses */}
            {msg.action_performed === 'grocery_generated' && msg.data && (
              <button
                onClick={() => handleCopyToClipboard(msg.data)}
                className="mt-2.5 w-full bg-amber-600/80 hover:bg-amber-600 text-amber-50 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1.5 border border-amber-500/40"
              >
                <span><Copy className="w-4 h-4" /></span>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input 
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendCopilotMessage()}
          placeholder="Ask anything or say 'Make grocery list'..."
          className="flex-1 bg-amber-900/60 border border-amber-700/60 rounded-xl px-3 py-2 text-xs text-amber-50 placeholder-amber-300/60 focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
        <button 
          onClick={handleSendCopilotMessage}
          className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-3 py-2 rounded-xl text-xs transition-all shadow-md shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )}

  {/* Floating Toggle Button (Always visible bottom-right) */}
  <button
    onClick={() => setIsCopilotOpen(!isCopilotOpen)}
    className="bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-white p-3.5 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2 border border-amber-400/30"
  >
    <ChefHat className="w-4 h-4" />
    
  </button>

</div>

      {/* --- MODAL 1: USER PREFERENCES --- */}
      {showPrefModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[92vw] max-w-md p-5 sm:p-6 shadow-2xl border border-amber-100 space-y-4 my-auto">
            <h3 className="text-lg font-serif font-bold text-stone-800">Configure Food Preferences</h3>
            
            {/* Cuisine Selection */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-2">Cuisine Styles</label>
              <div className="flex flex-wrap gap-2">
                {CUISINE_OPTIONS.map((style) => (
                  <button
                    key={style}
                    onClick={() => toggleCuisine(style)}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                      selectedCuisines.includes(style)
                        ? 'bg-amber-800 text-amber-50 border-amber-800 font-bold'
                        : 'bg-stone-50 text-stone-600 border-stone-200'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Meal Slots Enabled */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-2">Daily Meal Slots</label>
              <div className="flex gap-2">
                {MEAL_TYPES.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => toggleMealSlot(slot)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      enabledMeals.includes(slot)
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-stone-50 text-stone-400 border-stone-200'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {/* Dietary Type */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Dietary Preference</label>
              <select 
                value={dietary} 
                onChange={(e) => setDietary(e.target.value)}
                className="w-full text-xs p-2.5 border border-amber-200 rounded-xl bg-amber-50/30"
              >
                <option value="Non-Vegetarian">Non-Vegetarian</option>
                <option value="Vegetarian">Vegetarian</option>
                <option value="Eggetarian">Eggetarian</option>
                <option value="Vegan">Vegan</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button 
                onClick={() => setShowPrefModal(false)}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                Close
              </button>
              <button 
                onClick={() => setShowPrefModal(false)}
                className="px-4 py-2 text-xs font-bold bg-amber-800 text-amber-50 rounded-xl hover:bg-amber-900 shadow-md"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: CUSTOMISE / ADD DISH --- */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[92vw] max-w-md p-5 sm:p-6 shadow-2xl border border-amber-100 space-y-4 my-auto">
            <h3 className="text-lg font-serif font-bold text-stone-800">
              Set {selectedDay} {activeSlot}
            </h3>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Dish Name</label>
              <input 
                type="text" 
                placeholder="e.g., Masala Dosa with Coconut Chutney"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full text-xs p-2.5 border border-amber-200 rounded-xl bg-amber-50/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Short Description / Notes</label>
              <textarea 
                rows={2}
                placeholder="e.g., Crispy rice crepe with potato masala"
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                className="w-full text-xs p-2.5 border border-amber-200 rounded-xl bg-amber-50/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="prep"
                checked={customPrep}
                onChange={(e) => setCustomPrep(e.target.checked)}
                className="accent-amber-800 rounded"
              />
              <label htmlFor="prep" className="text-xs text-stone-700 font-medium">
                Requires advance prep (e.g. overnight soaking)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button 
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveCustomMeal}
                className="px-4 py-2 text-xs font-bold bg-amber-800 text-amber-50 rounded-xl hover:bg-amber-900 shadow-md"
              >
                Set Meal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
    </div>
  );
}
