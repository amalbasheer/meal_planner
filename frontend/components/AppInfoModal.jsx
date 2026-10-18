import React from 'react';

import { Calendar, InfoIcon, Lock, Utensils, AlarmClock, Weight, Bot } from 'lucide-react';

export default function AppInfoModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-amber-950 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-amber-200/60 dark:border-amber-800/80">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-amber-200/60 dark:border-amber-800/80 flex justify-between items-center bg-amber-100/70 dark:bg-amber-900/50">
          <h3 className="text-base sm:text-lg font-serif font-bold text-amber-950 dark:text-amber-100 flex items-center gap-2">
            <span><InfoIcon /></span> About Foodie Meal Planner
          </h3>
          <button 
            onClick={onClose}
            className="text-amber-800 dark:text-amber-200 hover:text-amber-950 dark:hover:text-white font-bold text-xl px-2 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Body Content: App Capabilities */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-3.5 text-xs sm:text-sm text-amber-900/80 dark:text-amber-200/90">
          <p className="font-medium text-amber-950 dark:text-amber-50">
            Welcome to your intelligent meal prep and automated reminder dashboard! Here is everything this app is capable of doing:
          </p>

          <div className="space-y-2.5">
            <div className="flex gap-3 items-start p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200/40 dark:border-amber-800/40">
              <span className="text-lg"><Calendar /></span>
              <div>
                <strong className="text-amber-950 dark:text-amber-100 block font-semibold">Dynamic Weekly Navigation</strong>
                Automatically detects the current day upon login and lands directly on today's meal schedule.
              </div>
            </div>

            <div className="flex gap-3 items-start p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200/40 dark:border-amber-800/40">
              <span className="text-lg"><AlarmClock /></span>
              <div>
                <strong className="text-amber-950 dark:text-amber-100 block font-semibold">Real-Time Push Alarms</strong>
                Background worker scans for scheduled prep tasks every minute and sends native desktop push notifications and in app alarm.
              </div>
            </div>

            <div className="flex gap-3 items-start p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200/40 dark:border-amber-800/40">
              <span className="text-lg"><Utensils /></span>
              <div>
                <strong className="text-amber-950 dark:text-amber-100 block font-semibold">Meal & Task Management</strong>
                Plan, organize, and track your daily meal preparation milestones seamlessly. Based on you preferrences and previous history itcan autogenerate meal plan for a week, and if you miss to add plan it will automatically repeat theprevious plan at end of the week. 
              </div>
            </div>

            <div className="flex gap-3 items-start p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200/40 dark:border-amber-800/40">
              <span className="text-lg"><Weight /></span>
              <div>
                <strong className="text-amber-950 dark:text-amber-100 block font-semibold">Healthier Alternate</strong>
                Calorie display, calorie intake, and healthier version for similar menu will be suggested and can switch to that menu too.
              </div>
            </div>

            <div className="flex gap-3 items-start p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200/40 dark:border-amber-800/40">
              <span className="text-lg"><Bot /></span>
              <div>
                <strong className="text-amber-950 dark:text-amber-100 block font-semibold">Foodie Assistant</strong>
                Smart AI assistant to guide, grocery lising, recipe etc.  
              </div>
            </div>

            <div className="flex gap-3 items-start p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200/40 dark:border-amber-800/40">
              <span className="text-lg"><Lock /></span>
              <div>
                <strong className="text-amber-950 dark:text-amber-100 block font-semibold">Secure VAPID Notifications</strong>
                Configured with standard Web Push encryption protocols and authenticated push endpoints.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-amber-200/60 dark:border-amber-800/80 bg-white dark:bg-amber-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-amber-800 text-amber-50 rounded-xl hover:bg-amber-900 shadow-md"
              >
            Got it!
          </button>
        </div>

      </div>
    </div>
  );
}