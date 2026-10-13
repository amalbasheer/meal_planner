from datetime import datetime, timedelta, date
import os
import re
import json
import urllib.parse
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from groq import Groq
from dotenv import load_dotenv

from urllib.parse import quote

load_dotenv()

app = FastAPI(title="Foodie Meal Planner API")

groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
# CORS configuration for Frontend
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "https://mealplanner-amalbasheer.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Client Initialization
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if SUPABASE_URL is None or SUPABASE_KEY is None:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==================== DATA MODELS ====================

class Recipe(BaseModel):
    id: str
    title: str
    description: Optional[str]
    image_url: Optional[str]
    prep_required: bool
    prep_instruction: Optional[str]
    prep_lead_hours: int

class UserPreferences(BaseModel):
    user_id: str
    cuisine_styles: List[str]
    enabled_meals: List[str]
    dietary_type: str
    spice_level: str

class CustomMealItem(BaseModel):
    user_id: str
    day: str
    meal_type: str
    recipe_title: str
    description: Optional[str] = None
    prep_required: Optional[bool] = False
    week_start_date: Optional[str] = None
    image_url: Optional[str] = None


class PrepStep(BaseModel):
    action: str
    offset_day: str  # "previous_day" or "same_day"
    suggested_time: str
    detail: str

class CalendarSyncRequest(BaseModel):
    title: str
    description: str
    target_day: str  # e.g., "Mon", "Tue"
    suggested_time: Optional[str] = "20:00"  # 24-hr format or "08:00 AM"
    week_start_date: Optional[str] = None

class CopilotChatRequest(BaseModel):
    user_id: str
    message: str
    week_start_date: Optional[str] = None

class PrepToggleRequest(BaseModel):
    user_id: str
    meal_id: Optional[str] = None
    day_of_week: str
    meal_type: str
    week_start_date: str
    prep_completed: bool

class GroceryToggleRequest(BaseModel):
    user_id: str
    week_start_date: str
    item_index: int
    is_bought: bool

# ==================== HELPER FUNCTIONS ====================
def get_active_groq_model() -> str:
    """
    Queries the Groq API for available models on the active API key
    and returns a valid working model ID automatically.
    """
    preferred_models = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama3-70b-8192",
        "llama3-8b-8192",
        "mixtral-8x7b-32768"
    ]
    try:
        available_models = [m.id for m in groq_client.models.list().data]
        for model in preferred_models:
            if model in available_models:
                return model
        # Fallback to the first available chat model if preferences aren't listed
        if available_models:
            return available_models[0]
    except Exception as e:
        print("Error fetching Groq models list:", e)
    
    # Safe default string
    return "llama3-8b-8192"


def get_current_week_monday() -> str:
    today = datetime.now().date()
    monday = today - timedelta(days=today.weekday())
    return monday.isoformat()


def fetch_dish_image_url(dish_title: str) -> str:
    """
    Dynamically generates a high-definition, perfectly matching food image URL 
    for ANY dish title without relying on hardcoded dish lists.
    """
    if not dish_title or not dish_title.strip():
        return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80"

    # Clean the title and encode it for a URL search query
    clean_title = dish_title.strip().lower()
    
    # Remove common filler words to keep the Unsplash image search precise
    for word in ["special", "homemade", "style", "authentic", "classic", "delicious", "gourmet", "fresh", "crispy", "spicy"]:
        clean_title = clean_title.replace(word, "")
        
    encoded_query = quote(clean_title.strip())
    
    # Construct a dynamic Unsplash source query optimized for professional food photography
    # This guarantees a relevant visual representation for items like "Truffle Pasta", "Ghee Roast", or "Avocado Toast"
    return f"https://source.unsplash.com/600x400/?{encoded_query},food,dish,gourmet"

def analyze_dish_prep_requirements(dish_title: str, meal_type: str, day_of_week: str) -> tuple[bool, list]:
    """
    Dynamically analyzes ANY dish using authentic culinary requirements:
    - Ragi Dosa: Ragi + Urad Dal / Flour soaking
    - Appam: Raw Rice + Coconut soaking/grinding (NO lentils/dal)
    - Calculates timings precisely for Breakfast, Lunch, or Dinner
    """
    prompt = f"""
    Analyze the dish: "{dish_title}" served for "{meal_type}" on {day_of_week}.

    1. Identify the authentic traditional ingredients for "{dish_title}".
       - Example: Appam uses Raw Rice & Coconut (NO lentils/Urad dal).
       - Example: Ragi Dosa uses Ragi (Finger Millet) & Urad Dal / Rice.
       - Example: Bhature / Naan uses Maida flour, Yogurt & Yeast (proofing).
       - Example: Rajma / Chole uses Kidney beans / Chickpeas (soaking).

    2. Determine if advance preparation (soaking, grinding, fermenting, proofing, or marinating) is needed.

    3. Calculate exact timing steps based on whether the meal is {meal_type}:
       - Breakfast: Soaking starts Previous Day Morning/Afternoon, Fermentation Previous Day Evening/Night.
       - Dinner: Soaking starts Same Day Morning (7:00 AM - 9:00 AM), Fermentation Same Day Afternoon (1:00 PM).

    Return ONLY a raw JSON object with NO markdown formatting:
    {{
        "prep_required": true,
        "steps": [
            {{
                "timing": "Exact time (e.g., 'Same Day 8:00 AM' or 'Previous Day 8:00 PM')",
                "action": "Specific action with correct ingredients (e.g., 'Soak raw rice & grated coconut for Appam batter')"
            }}
        ]
    }}

    If NO advance prep is needed (e.g. Toast, Scrambled Eggs, Quick Stir-fry), return "prep_required": false and "steps": [].
    """

    try:
        completion = groq_client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {
                    "role": "system", 
                    "content": "You are a world-class chef and culinary scientist. You output exact, ingredient-accurate advance prep steps in raw JSON format without markdown ticks."
                },
                {"role": "user", "content": prompt}
            ],
            
            temperature=0.1,  # Low temperature for factual precision
            max_tokens=400
        )
        
        raw_content = (completion.choices[0].message.content or "").strip()

        if not raw_content:
            print(f"Empty API response received for {dish_title}")
            return False, []

        # Clean potential markdown block formatting
        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        if json_match:
            raw_content = json_match.group(0)
            
        result = json.loads(raw_content)
        return result.get("prep_required", False), result.get("steps", [])
        
    except Exception as e:
        print(f"Dynamic prep analysis error for {dish_title}:", e)
        return False, []


def analyze_and_enrich_dish(dish_title: str, meal_type: str) -> str:
    """
    Dynamically generates a short, appetizing gourmet description 
    for ANY dish using Groq LLM (under 10 words), with no hardcoding.
    """
    prompt = f"""
    Analyze the dish: "{dish_title}" served for "{meal_type}".
    Write a short, appetizing, gourmet description for "{dish_title}" in less than 10 words.

    Return ONLY a raw JSON object matching this exact schema:
    {{
        "description": "Short description under 10 words..."
    }}
    """

    try:
        active_model = "openai/gpt-oss-120b"  # Use a high-capacity model for culinary analysis

        completion = groq_client.chat.completions.create(
            model=active_model,
            messages=[
                {"role": "system", "content": "You are a master chef and food writer. Output valid raw JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=150
        )
        
        raw_content = (completion.choices[0].message.content or "").strip()
        
        if not raw_content:
            return f"Freshly prepared {dish_title} for your {meal_type}."

        # Extract JSON using regular expressions
        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        if json_match:
            raw_content = json_match.group(0)
            
        result = json.loads(raw_content)
        desc = result.get("description") or f"Freshly prepared {dish_title} for your {meal_type}."

        return desc
        
    except Exception as e:
        print(f"Dynamic description error for {dish_title}: {e}")
        return f"Freshly prepared {dish_title} for your {meal_type}."


def analyze_dish_nutrition_and_alternatives(dish_title: str, meal_type: str) -> dict:
    """
    Dynamically generates calorie info, balanced eating advice, and a healthier alternative 
    for ANY dish using Groq LLM without JSON validation enforcement errors.
    """
    prompt = f"""
    Analyze the dish: "{dish_title}" served for "{meal_type}".
    Provide:
    1. "calorie_info": Calorie count and macro breakdown for a single serving.
    2. "balanced_advice": Recommended portion quantity and healthy protein/fiber pairing (e.g. eat 2 appam with quarter bowl of green peas).
    3. "alternative_dish": One healthy alternative replacement dish for this meal slot.

    Return ONLY a raw JSON object matching this exact schema:
    {{
        "calorie_info": "~120 kcal per serving, 25g carbs, 3g protein",
        "balanced_advice": "Eat 2 units with a quarter bowl of green peas curry for balanced protein & fiber.",
        "alternative_dish": "Ragi Dosa with mint chutney"
    }}
    """

    default_fallback = {
        "calorie_info": f"Calorie info for {dish_title} (approx. 250-350 kcal per serving)",
        "balanced_advice": "Pair with a side of fresh greens or protein.",
        "alternative_dish": "Whole grain alternative"
    }

    try:
        active_model = "openai/gpt-oss-120b"  # Or your active Groq model like "llama-3.3-70b-versatile"

        completion = groq_client.chat.completions.create(
            model=active_model,
            messages=[
                {"role": "system", "content": "You are an expert nutritionist and culinary advisor. Output valid raw JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=300
        )
        
        raw_content = (completion.choices[0].message.content or "").strip()
        
        if not raw_content:
            return default_fallback

        # Extract JSON using regular expressions to safely isolate the payload
        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        if json_match:
            raw_content = json_match.group(0)
            
        result = json.loads(raw_content)
        
        return {
            "calorie_info": result.get("calorie_info") or default_fallback["calorie_info"],
            "balanced_advice": result.get("balanced_advice") or default_fallback["balanced_advice"],
            "alternative_dish": result.get("alternative_dish") or default_fallback["alternative_dish"]
        }
        
    except Exception as e:
        print(f"Dynamic nutrition analysis error for {dish_title}: {e}")
        return default_fallback
    
# ==================== API ENDPOINTS ====================

@app.get("/")
def root():
    return {"message": "Foodie Meal Planner API with Smart AI Prep Active"}

@app.get("/api/recipes", response_model=List[Recipe])
def get_recipes():
    response = supabase.table("recipes").select("*").execute()
    return response.data

@app.get("/api/weekly-plans")
def get_user_weekly_plans(
    user_id: str = Query(..., description="Unique user identifier"),
    week_start_date: Optional[str] = None
):
    """
    Fetches the 21-meal plan specifically assigned to the given user ID.
    """
    target_week = week_start_date or get_current_week_monday()
    
    query = supabase.table("weekly_plans") \
        .select("*") \
        .eq("user_id", user_id) \
        .eq("week_start_date", target_week)
        
    response = query.execute()
    return response.data

@app.post("/api/preferences")
def save_preferences(prefs: UserPreferences):
    """Saves or updates individual user cuisine & meal slot choices."""
    data = {
        "user_id": prefs.user_id,
        "cuisine_styles": prefs.cuisine_styles,
        "enabled_meals": prefs.enabled_meals,
        "dietary_type": prefs.dietary_type,
        "spice_level": prefs.spice_level
    }
    response = supabase.table("user_preferences").upsert(data).execute()
    return {"status": "success", "data": response.data}

@app.get("/api/preferences/{user_id}")
def get_user_preferences(user_id: str):
    """Retrieves saved preferences for a specific user ID."""
    response = supabase.table("user_preferences").select("*").eq("user_id", user_id).execute()
    if response.data:
        return response.data[0]
    return {
        "user_id": user_id,
        "cuisine_styles": ["South Indian", "Continental/English"],
        "enabled_meals": ["Breakfast", "Lunch", "Dinner"],
        "dietary_type": "Non-Vegetarian",
        "spice_level": "Medium"
    }

def auto_schedule_prep_reminder(user_id: str, week_start_date: str, day_of_week: str, meal_type: str, dish_title: str):
    """
    Automatically calculates the prep date (previous day) and creates 
    a Google Task or reminder in Supabase / Google Tasks for the user.
    """
    day_map = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
    base_monday = datetime.strptime(week_start_date, "%Y-%m-%d")
    target_offset = day_map.get(day_of_week, 0)
    
    meal_date = base_monday + timedelta(days=target_offset)
    prep_date = meal_date - timedelta(days=1)  # Previous day
    prep_date_str = prep_date.strftime("%Y-%m-%d")

    task_payload = {
        "user_id": user_id,
        "title": f"🍳 Prep for {day_of_week} {meal_type}: {dish_title}",
        "description": f"Advance preparation (soaking/fermenting) required for {dish_title}.",
        "reminder_date": prep_date_str,
        "reminder_time": "20:00:00", # 8:00 PM evening prior
        "completed": False
    }

    # Automatically save to your user tasks table or Google Tasks
    try:
        supabase.table("user_prep_tasks").upsert(task_payload).execute()
    except Exception as e:
        print("Auto-task creation note:", e)


@app.post("/api/menu/custom-slot")
def set_custom_meal(meal: CustomMealItem):
    """
    Saves a custom dish slot while executing AI analysis to detect 
    and schedule required prep steps automatically.
    """
    week_start = meal.week_start_date or get_current_week_monday()
    image_link = meal.image_url or fetch_dish_image_url(meal.recipe_title)
    
    # Execute AI prep analysis
    auto_prep_flag, prep_steps = analyze_dish_prep_requirements(
        meal.recipe_title, meal.meal_type, meal.day
    )
    
    # Merge manual checkbox or auto-detected flag
    final_prep_required = meal.prep_required or auto_prep_flag

    # Generate AI description if not provided
    ai_description= analyze_and_enrich_dish(
        meal.recipe_title, meal.meal_type
    )
    # Use user-provided description if given, otherwise use AI-generated description
    final_description = meal.description if (meal.description and meal.description.strip()) else ai_description

    # 3. NEW: Generate Nutrition, Balanced Advice & Alternative Dish using Groq
    nutrition_data = analyze_dish_nutrition_and_alternatives(meal.recipe_title, meal.meal_type)
    
    data = {
        "user_id": meal.user_id,
        "day_of_week": meal.day,
        "meal_type": meal.meal_type,
        "title": meal.recipe_title,
        "description": final_description,
        "prep_required": final_prep_required,
        "week_start_date": week_start,
        "image_url": image_link,
        "prep_instruction": json.dumps(prep_steps) if prep_steps else None,
        "calorie_info": nutrition_data.get("calorie_info"),
        "balanced_advice": nutrition_data.get("balanced_advice"),
        "alternative_dish": nutrition_data.get("alternative_dish")
    }
    if final_prep_required:
       auto_schedule_prep_reminder(meal.user_id, week_start, meal.day, meal.meal_type, meal.recipe_title)
    response = supabase.table("weekly_plans").upsert(
        data, 
        on_conflict="user_id,week_start_date,day_of_week,meal_type"
    ).execute()
    return {
        "status": "success", 
        "updated_meal": response.data,
        "auto_detected_prep": final_prep_required,
        "prep_steps": prep_steps,
        "nutrition": nutrition_data
    }

@app.get("/api/smart-prep-schedule")
def get_smart_prep_schedule(
    user_id: str = Query(...),
    week_start_date: Optional[str] = None
):
    """
    Scans the user's active weekly plan and compiles a chronological timeline 
    of advance preparations (e.g., soaking, grinding, thawing) indexed by day.
    """
    target_week = week_start_date or get_current_week_monday()
    
    response = supabase.table("weekly_plans") \
        .select("*") \
        .eq("user_id", user_id) \
        .eq("week_start_date", target_week) \
        .eq("prep_required", True) \
        .execute()
        
    schedules = []
    for plan in response.data:
        if not isinstance(plan, dict):
            continue

        steps = []
        prep_instruction = plan.get("prep_instruction")
        if isinstance(prep_instruction, str) and prep_instruction:
            try:
                parsed_steps = json.loads(prep_instruction)
                steps = parsed_steps if isinstance(parsed_steps, list) else []
            except Exception:
                steps = []
                
        schedules.append({
            "meal_id": plan.get("id"),
            "target_day": plan.get("day_of_week"),
            "meal_type": plan.get("meal_type"),
            "dish_title": plan.get("title"),
            "prep_steps": steps
        })
        
    return {"user_id": user_id, "active_prep_schedules": schedules}

@app.post("/api/calendar/generate-link")
def generate_calendar_sync_link(req: CalendarSyncRequest):
    """
    Computes exact date-time offsets relative to target day/week 
    and returns a direct Google Calendar event creation URL.
    """
    week_start = req.week_start_date or get_current_week_monday()
    base_monday = datetime.strptime(week_start, "%Y-%m-%d")

    day_map = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
    target_offset = day_map.get(req.target_day, 0)
    
    # Target meal date
    meal_date = base_monday + timedelta(days=target_offset)
    
    # Prep happens previous day evening (default rule)
    prep_date = meal_date - timedelta(days=1)
    
    # ISO string formatting for Google Calendar URL (YYYYMMDDTHHMMSS)
    start_dt = prep_date.strftime("%Y%m%dT200000")  # Default 8:00 PM
    end_dt = prep_date.strftime("%Y%m%dT203000")    # Default 8:30 PM

    title = f"🍳 Foodie Prep: {req.title}"
    details = f"Advance Preparation Reminder for {req.target_day}:\n\n{req.description}"
    
    encoded_title = urllib.parse.quote(title)
    encoded_details = urllib.parse.quote(details)

    gcal_url = (
        f"https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={encoded_title}"
        f"&details={encoded_details}"
        f"&dates={start_dt}/{end_dt}"
    )

    return {
        "status": "success",
        "google_calendar_url": gcal_url
    }

@app.post("/api/menu/auto-generate")
def auto_generate_menu(payload: dict):
    """
    Auto-generates a full weekly menu based on user preferences 
    and previous week history if no plan exists.
    """
    user_id = payload.get("user_id")
    if not isinstance(user_id, str):
        raise HTTPException(status_code=400, detail="user_id must be a string")
    target_week = payload.get("week_start_date") or get_current_week_monday()
    
    # 1. Fetch user preferences
    pref_res = supabase.table("user_preferences").select("*").eq("user_id", user_id).execute()
    preferences = pref_res.data[0] if pref_res.data else {
        "cuisine_styles": ["South Indian", "Continental/English"],
        "enabled_meals": ["Breakfast", "Lunch", "Dinner"],
        "dietary_type": "Non-Vegetarian"
    }
    
    if not isinstance(preferences, dict):
        preferences = {}

    cuisines = preferences.get("cuisine_styles", ["South Indian"])
    if not isinstance(cuisines, list) or not cuisines:
        cuisines = ["South Indian"]

    enabled_slots = preferences.get("enabled_meals", ["Breakfast", "Lunch", "Dinner"])
    if not isinstance(enabled_slots, list):
        enabled_slots = ["Breakfast", "Lunch", "Dinner"]
    dietary = preferences.get("dietary_type", "Non-Vegetarian")

    # 2. Sample menu templates rotated across cuisines & diets
    sample_dishes = {
        "South Indian": {
            "Breakfast": [("Masala Dosa with Chutney", "Crispy rice crepe with potato filling"), ("Idli Sambar", "Steamed rice cakes with lentil soup"), ("Appam with Stew", "Lacy fermented coconut pancakes")],
            "Lunch": [("Kerala Fish Curry & Rice", "Spicy coconut milk fish curry"), ("Sambar Rice with Poriyal", "Traditional lentil and vegetable rice bowl"), ("Lemon Rice with Kurma", "Tangy tempering rice with mixed vegetables")],
            "Dinner": [("Chapati with Veg Kurma", "Soft whole wheat flatbreads"), ("Uthappam with Tomato Chutney", "Thick savory pancake"), ("Ragi Dosa", "Nutritious finger millet crepe")]
        },
        "Continental/English": {
            "Breakfast": [("Scrambled Eggs on Toast", "Fluffy butter eggs with sourdough"), ("Avocado Toast with Poached Egg", "Smash avocado on toasted artisan bread"), ("Classic Pancakes", "Fluffy pancakes with maple syrup")],
            "Lunch": [("Grilled Chicken Salad", "Mixed greens with vinaigrette"), ("Creamy Mushroom Pasta", "Fettuccine with garlic cream sauce"), ("Classic Club Sandwich", "Layered chicken and lettuce sandwich")],
            "Dinner": [("Baked Salmon with Asparagus", "Herb-crusted fillet with roasted veggies"), ("Roast Chicken with Veggies", "Juicy roasted poultry with potatoes"), ("Vegetable Lasagna", "Layered pasta with rich tomato sauce")]
        }
    }

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    generated_meals = []

    # 3. Build 21-meal or enabled slot schedule
    for day in days:
        for slot in enabled_slots:
            # Pick a cuisine style rotation
            cuisine = cuisines[hash(f"{day}{slot}") % len(cuisines)]
            if not isinstance(cuisine, str) or cuisine not in sample_dishes:
                cuisine = list(sample_dishes.keys())[0]
                
            slot_options = sample_dishes[cuisine].get(str(slot), [("Healthy Bowl", "Balanced meal options")])
            dish_title, dish_desc = slot_options[hash(day) % len(slot_options)]
            
            # If vegetarian preference, ensure title matches
            if dietary == "Vegetarian" and "Chicken" in dish_title:
                dish_title = "Paneer Tikka Bowl"
                dish_desc = "Grilled cottage cheese with spices"

            image_link = fetch_dish_image_url(dish_title)
            requires_prep, prep_steps = analyze_dish_prep_requirements(dish_title, str(slot), day)

            meal_record = {
                "user_id": user_id,
                "day_of_week": day,
                "meal_type": slot,
                "title": dish_title,
                "description": dish_desc,
                "prep_required": requires_prep,
                "week_start_date": target_week,
                "image_url": image_link,
                "prep_instruction": json.dumps(prep_steps) if prep_steps else None
            }
            
            generated_meals.append(meal_record)
            # Upsert into database
            supabase.table("weekly_plans").upsert(
                    meal_record, 
                    on_conflict="user_id,week_start_date,day_of_week,meal_type"
                    ).execute()
            if requires_prep:
                auto_schedule_prep_reminder(user_id, target_week, day, str(slot), dish_title)
    return {
        "status": "success",
        "message": "Menu successfully auto-generated based on user preferences!",
        "total_generated": len(generated_meals)
    }

def generate_recipe_with_ai(dish_name: str) -> str:
    """Uses Groq / LLM to dynamically generate accurate recipes when DB lacks info."""
    prompt = (
        f"Provide a clear, authentic, and step-by-step recipe for '{dish_name}'. "
        "Include: \n"
        "1. Prep time & cook time\n"
        "2. Key Ingredients list (with measurements)\n"
        "3. Clear step-by-step cooking instructions\n"
        "4. Pro tip or serving suggestion\n"
        "Keep the output concise, clean, and nicely formatted."
    )
    
    try:
        completion = groq_client.chat.completions.create(
            model=get_active_groq_model(),
            messages=[
                {"role": "system", "content": "You are Foodie AI, an expert chef and culinary assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=600
        )
        return completion.choices[0].message.content or ""
    except Exception as e:
        print("LLM Generation Error:", e)
        # Fallback template if API fails or key is missing
        return (
            f"📖 **Recipe Guide for {dish_name.title()}**\n\n"
            f"**Ingredients:** Fresh herbs, key proteins/vegetables, aromatics (garlic/ginger), cooking oil, and essential spices.\n\n"
            f"**Step 1:** Prep and chop all required vegetables and proteins.\n"
            f"**Step 2:** Heat oil in a pan, sauté aromatics, and add main ingredients.\n"
            f"**Step 3:** Season with spices and simmer until fully cooked.\n"
            f"**Step 4:** Serve hot with garnishing!"
        )

@app.post("/api/copilot/chat")
def copilot_chat(req: CopilotChatRequest):
    msg = req.message.lower().strip()
    user_id = req.user_id
    target_week = req.week_start_date or get_current_week_monday()

    # Intent 1: Grocery List Generation & Saving
    if any(k in msg for k in ["grocery", "shopping list", "buy"]):
        res = supabase.table("weekly_plans").select("*").eq("user_id", user_id).eq("week_start_date", target_week).execute()
        meals = res.data
        
        items = []
        for m in meals:
            title = m.get("title") if isinstance(m, dict) else None
            items.append({"name": f"Ingredients for {title or 'meal'}", "bought": False})
        
        if not items:
            items = [{"name": "Fresh vegetables & produce", "bought": False}, {"name": "Cooking oil & spices", "bought": False}]

        grocery_payload = {
            "user_id": user_id,
            "week_start_date": target_week,
            "title": f"Grocery List for Week {target_week}",
            "items": items,
            "is_bought": False
        }
        
        supabase.table("grocery_lists").upsert(grocery_payload, on_conflict="user_id,week_start_date").execute()
        
        return {
            "response_text": "I've generated your grocery list and saved it to your notes! You can check off items as you buy them below.",
            "action_performed": "grocery_generated",
            "data": grocery_payload
        }

    # Intent 2: Recipe Requests
    elif any(k in msg for k in ["recipe", "how to make", "how do i cook", "ingredients for"]):
        dish_query = (
            msg.replace("recipe for", "")
            .replace("how to make", "")
            .replace("how do i cook", "")
            .replace("ingredients for", "")
            .replace("recipe", "")
            .strip()
        )
        
        # 1. First check Supabase recipes table
        recipe_res = supabase.table("recipes").select("*").ilike("title", f"%{dish_query}%").execute()
        
        if recipe_res.data and isinstance(recipe_res.data[0], dict):
            recipe = recipe_res.data[0]
            recipe_text = (
                f"📖 **Recipe: {recipe.get('title')}**\n\n"
                f"{recipe.get('description', 'Delicious homemade preparation.')}\n\n"
                f"⏱️ **Prep Time:** {recipe.get('prep_lead_hours', 2)} hours\n\n"
                f"📝 **Instructions:** {recipe.get('prep_instruction', 'Follow standard cooking method.')}"
            )
        else:
            # 2. Dynamic AI LLM generation fallback if table lacks info
            recipe_text = generate_recipe_with_ai(dish_query or "this dish")

        return {
            "response_text": recipe_text,
            "action_performed": "recipe_provided"
        }

    # Intent 3: General Q&A
    else:
        # Pass general chat queries directly to the LLM
        try:
            ai_response = groq_client.chat.completions.create(
                model="meta-llama/llama-prompt-guard-2-22m",
                messages=[
                    {"role": "system", "content": "You are Foodie AI, an intelligent meal planning and cooking copilot."},
                    {"role": "user", "content": req.message}
                ],
                max_tokens=300
            ).choices[0].message.content
        except Exception:
            ai_response = "I'm your Foodie AI Copilot! I can give you full recipes, plan meals, track advance prep timelines, or generate grocery lists. What would you like to do?"

        return {
            "response_text": ai_response,
            "action_performed": "general_chat"
        }

@app.post("/api/prep/toggle-status")
def toggle_prep_status(req: PrepToggleRequest):
    """Marks advance preparation as done or pending."""
    response = supabase.table("weekly_plans") \
        .update({"prep_completed": req.prep_completed}) \
        .eq("user_id", req.user_id) \
        .eq("week_start_date", req.week_start_date) \
        .eq("day_of_week", req.day_of_week) \
        .eq("meal_type", req.meal_type) \
        .execute()
        
    return {"status": "success", "updated": response.data}

@app.get("/api/grocery/get")
def get_grocery_list(user_id: str, week_start_date: Optional[str] = None):
    """Retrieves saved grocery list for the user."""
    target_week = week_start_date or get_current_week_monday()
    res = supabase.table("grocery_lists").select("*").eq("user_id", user_id).eq("week_start_date", target_week).execute()
    if res.data:
        return res.data[0]
    return {"items": [], "title": "No Grocery List Yet"}

@app.post("/api/grocery/toggle-item")
def toggle_grocery_item(req: GroceryToggleRequest):
    """Updates individual item bought status in the grocery list."""
    res = supabase.table("grocery_lists").select("*").eq("user_id", req.user_id).eq("week_start_date", req.week_start_date).execute()
    if not res.data:
        return {"status": "error", "message": "List not found"}

    list_data = res.data[0]
    if not isinstance(list_data, dict):
        return {"status": "error", "message": "List data invalid"}

    items = list_data.get("items", [])
    if not isinstance(items, list):
        return {"status": "error", "message": "List items invalid"}

    if 0 <= req.item_index < len(items):
        item = items[req.item_index]
        if not isinstance(item, dict):
            return {"status": "error", "message": "Item data invalid"}
        item["bought"] = req.is_bought

        updated = supabase.table("grocery_lists") \
            .update({"items": items}) \
            .eq("id", list_data["id"]) \
            .execute()
        return {"status": "success", "data": updated.data}

    return {"status": "error", "message": "Invalid item index"}
    
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)