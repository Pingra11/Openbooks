#!/usr/bin/env python3
"""
OpenBooks Server - Unified Python server with Firebase Admin SDK
Serves static files and provides Firebase Admin API endpoints.
"""
import os
import sys
import json
import re
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory

import firebase_admin
from firebase_admin import credentials, auth, firestore

# Determine base directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(SCRIPT_DIR, 'web')
CONFIG_DIR = os.path.join(SCRIPT_DIR, 'config')

app = Flask(__name__, static_folder=WEB_DIR, static_url_path='')

PORT = 5000
HOST = '0.0.0.0'

firebase_initialized = False
db = None

def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    global firebase_initialized, db
    
    if firebase_initialized:
        return True
    
    # Check config folder first, then current directory
    service_account_path = os.path.join(CONFIG_DIR, 'firebase-service-account.json')
    if not os.path.exists(service_account_path):
        service_account_path = os.path.join(SCRIPT_DIR, 'firebase-service-account.json')
    if not os.path.exists(service_account_path):
        service_account_path = 'firebase-service-account.json'
    
    if not os.path.exists(service_account_path):
        print(f"ERROR: {service_account_path} not found!")
        print("Please ensure your Firebase service account file is in the project root.")
        return False
    
    try:
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        firebase_initialized = True
        print("Firebase Admin SDK initialized successfully")
        return True
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return False

@app.after_request
def add_cache_headers(response):
    """Add cache control headers to prevent caching issues"""
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def serve_index():
    return send_from_directory(WEB_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(WEB_DIR, path)

@app.route('/api/get-repl-token', methods=['GET'])
def get_repl_token():
    """Get authentication token - returns simulated token for offline use"""
    return jsonify({'token': 'offline-mode'})

@app.route('/api/create-firebase-user', methods=['POST'])
def create_firebase_user():
    """Create a new user in Firebase Authentication"""
    if not firebase_initialized:
        return jsonify({'success': False, 'error': 'Firebase not initialized'}), 500
    
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({
                'success': False,
                'error': 'Email and password are required'
            }), 400
        
        user_record = auth.create_user(
            email=email,
            password=password,
            email_verified=False
        )
        
        print(f"Successfully created Firebase Auth user: {email} ({user_record.uid})")
        
        return jsonify({
            'success': True,
            'message': f'Firebase Auth user {email} created successfully',
            'uid': user_record.uid
        })
        
    except auth.EmailAlreadyExistsError:
        return jsonify({
            'success': False,
            'error': 'The email address is already in use by another account',
            'code': 'auth/email-already-exists'
        }), 400
    except Exception as e:
        print(f"Error creating Firebase user: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'code': getattr(e, 'code', 'unknown-error')
        }), 500

@app.route('/api/update-firebase-user', methods=['POST'])
def update_firebase_user():
    """Update an existing user in Firebase Authentication"""
    if not firebase_initialized:
        return jsonify({'success': False, 'error': 'Firebase not initialized'}), 500
    
    try:
        data = request.get_json()
        current_email = data.get('currentEmail')
        new_email = data.get('newEmail')
        first_name = data.get('firstName', '')
        last_name = data.get('lastName', '')
        disabled = data.get('disabled')
        
        if not current_email:
            return jsonify({
                'success': False,
                'error': 'Current email is required'
            }), 400
        
        user_record = auth.get_user_by_email(current_email)
        
        update_data = {}
        
        if new_email and new_email != current_email:
            update_data['email'] = new_email
        
        if first_name or last_name:
            update_data['display_name'] = f"{first_name} {last_name}".strip()
        
        if isinstance(disabled, bool):
            update_data['disabled'] = disabled
        
        updated_user = auth.update_user(user_record.uid, **update_data)
        
        print(f"Successfully updated Firebase Auth user: {current_email} -> {new_email or current_email} ({user_record.uid})")
        
        return jsonify({
            'success': True,
            'message': 'Firebase Auth user updated successfully',
            'uid': updated_user.uid,
            'updatedFields': list(update_data.keys())
        })
        
    except auth.UserNotFoundError:
        return jsonify({
            'success': False,
            'error': 'User not found in Firebase Auth',
            'code': 'auth/user-not-found'
        }), 404
    except auth.EmailAlreadyExistsError:
        return jsonify({
            'success': False,
            'error': 'The new email address is already in use by another account',
            'code': 'auth/email-already-exists'
        }), 400
    except Exception as e:
        print(f"Error updating Firebase user: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'code': getattr(e, 'code', 'unknown-error')
        }), 500

@app.route('/api/delete-firebase-user', methods=['POST'])
def delete_firebase_user():
    """Delete a user from Firebase Authentication"""
    if not firebase_initialized:
        return jsonify({'success': False, 'error': 'Firebase not initialized'}), 500
    
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({
                'success': False,
                'error': 'Email is required'
            }), 400
        
        user_record = auth.get_user_by_email(email)
        auth.delete_user(user_record.uid)
        
        print(f"Successfully deleted Firebase Auth user: {email} ({user_record.uid})")
        
        return jsonify({
            'success': True,
            'message': f'Firebase Auth user {email} deleted successfully',
            'uid': user_record.uid
        })
        
    except auth.UserNotFoundError:
        return jsonify({
            'success': True,
            'message': 'User not found in Firebase Auth (may have been already deleted)',
            'warning': 'User was not in Firebase Auth'
        })
    except Exception as e:
        print(f"Error deleting Firebase user: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'code': getattr(e, 'code', 'unknown-error')
        }), 500

@app.route('/api/send-email', methods=['POST'])
def send_email():
    """Handle email sending - simulates email and logs to console"""
    if not firebase_initialized:
        return jsonify({'success': False, 'error': 'Firebase not initialized'}), 500
    
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({
                'success': False,
                'error': 'Unauthorized: Missing authentication token'
            }), 401
        
        id_token = auth_header.split('Bearer ')[1]
        
        try:
            decoded_token = auth.verify_id_token(id_token)
        except Exception as e:
            print(f"Token verification failed: {e}")
            return jsonify({
                'success': False,
                'error': 'Unauthorized: Invalid authentication token'
            }), 401
        
        user_doc = db.collection('users').document(decoded_token['uid']).get()
        if not user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'Forbidden: User not found'
            }), 403
        
        user_data = user_doc.to_dict()
        user_role = (user_data.get('role') or '').lower()
        allowed_roles = ['administrator', 'manager', 'accountant']
        
        if user_role not in allowed_roles:
            print(f"User {decoded_token['uid']} with role {user_data.get('role')} attempted to send email")
            return jsonify({
                'success': False,
                'error': 'Forbidden: Only administrators, managers, and accountants can send emails'
            }), 403
        
        data = request.get_json()
        to = data.get('to', [])
        cc = data.get('cc', [])
        subject = data.get('subject', '')
        text = data.get('text', '')
        html = data.get('html', '')
        
        if not to or not subject or (not text and not html):
            return jsonify({
                'success': False,
                'error': 'Missing required fields: to, subject, and (text or html) are required'
            }), 400
        
        recipients = to if isinstance(to, list) else [to]
        
        email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        for email in recipients:
            if not email_regex.match(email):
                return jsonify({
                    'success': False,
                    'error': f'Invalid email address: {email}'
                }), 400
        
        print("=" * 50)
        print("EMAIL SENT (Simulated)")
        print("=" * 50)
        print(f"To: {', '.join(recipients)}")
        if cc:
            cc_list = cc if isinstance(cc, list) else [cc]
            print(f"CC: {', '.join(cc_list)}")
        print(f"Subject: {subject}")
        print("-" * 50)
        print(f"Message:\n{text[:500]}{'...' if len(text) > 500 else ''}")
        print("=" * 50)
        
        return jsonify({
            'success': True,
            'message': f'Email logged successfully to {len(recipients)} recipient(s)',
            'recipients': recipients,
            'accepted': recipients,
            'rejected': [],
            'messageId': f'sim-{datetime.now().strftime("%Y%m%d%H%M%S")}'
        })
        
    except Exception as e:
        print(f"Error processing email: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/notify-managers-journal-submission', methods=['POST'])
def notify_managers_journal_submission():
    """Send notification to managers about pending journal entry approval"""
    if not firebase_initialized:
        return jsonify({'success': False, 'error': 'Firebase not initialized'}), 500
    
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({
                'success': False,
                'error': 'Unauthorized: Missing authentication token'
            }), 401
        
        id_token = auth_header.split('Bearer ')[1]
        
        try:
            decoded_token = auth.verify_id_token(id_token)
        except Exception as e:
            print(f"Token verification failed: {e}")
            return jsonify({
                'success': False,
                'error': 'Unauthorized: Invalid authentication token'
            }), 401
        
        user_doc = db.collection('users').document(decoded_token['uid']).get()
        if not user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'Forbidden: User not found'
            }), 403
        
        user_data = user_doc.to_dict()
        user_role = (user_data.get('role') or '').lower()
        
        if user_role not in ['accountant', 'manager', 'administrator']:
            return jsonify({
                'success': False,
                'error': 'Forbidden: Only accountants, managers, and administrators can submit journal entries for approval'
            }), 403
        
        data = request.get_json()
        journal_entry_number = data.get('journalEntryNumber')
        submitted_by = data.get('submittedBy')
        date = data.get('date', 'N/A')
        description = data.get('description', 'N/A')
        total_amount = data.get('totalAmount', 'N/A')
        
        if not journal_entry_number or not submitted_by:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: journalEntryNumber and submittedBy are required'
            }), 400
        
        users_ref = db.collection('users').where('active', '==', True).stream()
        
        manager_emails = []
        for doc in users_ref:
            user = doc.to_dict()
            role = (user.get('role') or '').lower()
            if role == 'manager' and user.get('email') and not user.get('suspended'):
                manager_emails.append(user.get('email'))
        
        if not manager_emails:
            return jsonify({
                'success': True,
                'message': 'No manager emails found',
                'notified': 0
            })
        
        subject = f"New Journal Entry Awaiting Approval: {journal_entry_number}"
        text = f"""Hello,

A new journal entry has been submitted for your approval:

Entry Number: {journal_entry_number}
Submitted By: {submitted_by}
Date: {date}
Description: {description}
Total Amount: {total_amount}

Please log in to OpenBooks to review and approve this journal entry.

Best regards,
OpenBooks System"""

        print("=" * 50)
        print("MANAGER NOTIFICATION (Simulated)")
        print("=" * 50)
        print(f"To: {', '.join(manager_emails)}")
        print(f"Subject: {subject}")
        print("-" * 50)
        print(f"Message:\n{text}")
        print("=" * 50)
        
        return jsonify({
            'success': True,
            'message': 'Manager notification sent successfully (simulated)',
            'notified': len(manager_emails),
            'recipients': manager_emails,
            'accepted': manager_emails,
            'rejected': [],
            'messageId': f'notify-{datetime.now().strftime("%Y%m%d%H%M%S")}',
            'testMode': True
        })
        
    except Exception as e:
        print(f"Error sending manager notification: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/verify-token', methods=['POST'])
def verify_token():
    """Verify a Firebase ID token"""
    if not firebase_initialized:
        return jsonify({'success': False, 'error': 'Firebase not initialized'}), 500
    
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({
                'success': False,
                'error': 'Missing authentication token'
            }), 401
        
        id_token = auth_header.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        
        return jsonify({
            'success': True,
            'uid': decoded_token['uid'],
            'email': decoded_token.get('email')
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 401

if __name__ == "__main__":
    print("=" * 50)
    print("OpenBooks Server Starting...")
    print("=" * 50)
    
    if not initialize_firebase():
        print("WARNING: Running without Firebase Admin SDK")
        print("User management features will not work")
    
    print(f"Server starting at http://{HOST}:{PORT}")
    print(f"Serving static files from: {WEB_DIR}")
    print("=" * 50)
    
    app.run(host=HOST, port=PORT, debug=False, threaded=True)
