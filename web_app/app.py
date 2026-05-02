from flask import Flask, render_template, request, jsonify
import numpy as np
import json
import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
SCRIPT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATABASE_FILE_PATH = os.path.join(SCRIPT_DIRECTORY, 'users.json')

# Database Setup
MONGODB_URI = os.environ.get('MONGODB_URI')
db = None
if MONGODB_URI:
    client = MongoClient(MONGODB_URI)
    db = client.get_database('behavior_biometrics')
    users_collection = db.users

def get_user_profile(username):
    if db is not None:
        return users_collection.find_one({"username": username})
    
    # Fallback to JSON
    if os.path.exists(DATABASE_FILE_PATH):
        with open(DATABASE_FILE_PATH, 'r') as f:
            data = json.load(f)
            return data.get(username)
    return None

def save_user_profile(username, profile_data):
    if db is not None:
        users_collection.update_one(
            {"username": username},
            {"$set": profile_data},
            upsert=True
        )
        return

    # Fallback to JSON
    data = {}
    if os.path.exists(DATABASE_FILE_PATH):
        with open(DATABASE_FILE_PATH, 'r') as f:
            data = json.load(f)
    
    data[username] = profile_data
    with open(DATABASE_FILE_PATH, 'w') as f:
        json.dump(data, f, indent=4)

def convert_typing_to_features(raw_keystroke_list):
    if len(raw_keystroke_list) < 10:
        return None
        
    key_hold_durations = []
    gap_between_keys = []
    
    for index in range(len(raw_keystroke_list)):
        hold_time = (raw_keystroke_list[index]['releaseTime'] - raw_keystroke_list[index]['pressTime']) / 1000.0
        if 0 < hold_time < 1.0:
            key_hold_durations.append(hold_time)
        
        if index < len(raw_keystroke_list) - 1:
            flight_time = (raw_keystroke_list[index+1]['pressTime'] - raw_keystroke_list[index]['releaseTime']) / 1000.0
            if 0 < flight_time < 1.5:
                gap_between_keys.append(flight_time)
            
    if not key_hold_durations or not gap_between_keys:
        return None

    user_behavior_summary = {
        "avg_dwell": float(np.mean(key_hold_durations)),
        "avg_flight": float(np.mean(gap_between_keys)),
        "std_dwell": float(np.std(key_hold_durations)),
        "std_flight": float(np.std(gap_between_keys)),
        "raw_dwell": key_hold_durations, 
        "raw_flight": gap_between_keys
    }
    return user_behavior_summary

def get_similarity_percentage(original_profile, current_profile):
    original_vector = np.array([original_profile['avg_dwell'], original_profile['avg_flight']])
    current_vector = np.array([current_profile['avg_dwell'], current_profile['avg_flight']])
    
    math_distance = np.linalg.norm(original_vector - current_vector)
    
    final_score = max(0, 100 - (math_distance * 400)) 
    return round(final_score, 2)

@app.route('/')
def show_home_page():
    return render_template('index.html')

@app.route('/enroll', methods=['POST'])
def register_new_user():
    incoming_data = request.json
    selected_username = incoming_data.get('username')
    typing_sample = incoming_data.get('sample', [])
    
    calculated_features = convert_typing_to_features(typing_sample)
    if not calculated_features:
        return jsonify({"success": False, "message": "Need more typing data!"})
            
    save_user_profile(selected_username, calculated_features)
    
    return jsonify({"success": True, "message": f"Profile created for {selected_username}!"})

@app.route('/authenticate', methods=['POST'])
def verify_user_identity():
    incoming_data = request.json
    provided_username = incoming_data.get('username')
    new_typing_sample = incoming_data.get('sample', [])
    
    original_user_data = get_user_profile(provided_username)
    if not original_user_data:
        return jsonify({"success": False, "message": "User not found!"})
        
    current_user_data = convert_typing_to_features(new_typing_sample)
    
    if not current_user_data:
        return jsonify({"success": False, "message": "Typing was too short/erratic."})
        
    match_percentage = get_similarity_percentage(original_user_data, current_user_data)
    
    passing_threshold = 70.0
    is_user_verified = match_percentage >= passing_threshold
    
    return jsonify({
        "success": True, 
        "authenticated": is_user_verified,
        "score": match_percentage,
        "threshold": passing_threshold,
        "baseline": original_user_data,
        "current": current_user_data
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
