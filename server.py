import http.server
import socketserver
import json
import smtplib
from email.mime.text import MIMEText
import os
import urllib.request
import urllib.parse
import base64

PORT = 5500

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/send-otp':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            email = data.get('email')
            phone = data.get('phone')
            otp = data.get('otp')
            
            email_sent = False
            sms_sent = False
            email_error = None
            sms_error = None
            mocked = True

            # 1. Handle SMS OTP via Twilio
            sms_config_path = 'sms_config.json'
            if phone and os.path.exists(sms_config_path):
                try:
                    with open(sms_config_path, 'r') as f:
                        sms_config = json.load(f)
                    
                    sid = sms_config.get('twilio_account_sid')
                    token = sms_config.get('twilio_auth_token')
                    from_num = sms_config.get('twilio_from_number')
                    
                    if sid and token and from_num:
                        # Twilio API request
                        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
                        sms_body = f"Your AMS Verification Code is: {otp}. Valid for 10 minutes."
                        payload = urllib.parse.urlencode({
                            'From': from_num,
                            'To': phone,
                            'Body': sms_body
                        }).encode('utf-8')
                        
                        req = urllib.request.Request(url, data=payload, method='POST')
                        auth_str = f"{sid}:{token}"
                        auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
                        req.add_header("Authorization", f"Basic {auth_b64}")
                        
                        with urllib.request.urlopen(req) as resp:
                            resp_data = resp.read().decode('utf-8')
                            print(f"\n[REAL SMS SENT] To: {phone} | OTP: {otp}\n")
                            sms_sent = True
                            mocked = False
                    else:
                        sms_error = "Twilio credentials missing in sms_config.json"
                except Exception as e:
                    print("\n[SMS ERROR] Failed to send SMS:", e)
                    sms_error = str(e)
            
            # 2. Handle Email OTP
            email_config_path = 'smtp_config.json'
            if email and os.path.exists(email_config_path):
                try:
                    with open(email_config_path, 'r') as f:
                        config = json.load(f)
                    
                    smtp_server = config.get('smtp_server', 'smtp.gmail.com')
                    smtp_port = config.get('smtp_port', 587)
                    smtp_user = config.get('smtp_user')
                    smtp_password = config.get('smtp_password')
                    
                    if smtp_user and smtp_password:
                        msg = MIMEText(f"Hello,\n\nYour 6-digit verification code is: {otp}\n\nThis OTP is valid for 10 minutes.\n\nRegards,\nAttendance Management System")
                        msg['Subject'] = f"AMS Verification Code: {otp}"
                        msg['From'] = smtp_user
                        msg['To'] = email
                        
                        server = smtplib.SMTP(smtp_server, smtp_port)
                        server.starttls()
                        server.login(smtp_user, smtp_password)
                        server.sendmail(smtp_user, [email], msg.as_string())
                        server.close()
                        
                        print(f"\n[REAL EMAIL SENT] To: {email} | OTP: {otp}\n")
                        email_sent = True
                        mocked = False
                    else:
                        email_error = "SMTP credentials missing in smtp_config.json"
                except Exception as e:
                    print("\n[SMTP ERROR] Failed to send email:", e)
                    email_error = str(e)

            # If mocked is True, log to console
            if mocked:
                print(f"\n[MOCK OTP SENT] To: {email or 'N/A'} (Email) | To: {phone or 'N/A'} (SMS) | OTP: {otp}\n")

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'mocked': mocked,
                'sms_sent': sms_sent,
                'email_sent': email_sent,
                'sms_error': sms_error,
                'email_error': email_error,
                'otp': otp
            }).encode('utf-8'))
        else:
            super().do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

# Serve static files and run server
Handler = MyHandler
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Stopping server...")
        httpd.shutdown()
