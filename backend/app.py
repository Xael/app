from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_mysqldb import MySQL
import os, json, uuid, datetime

app = Flask(__name__)
CORS(app)

# Configuração do MySQL
app.config['MYSQL_HOST'] = 'localhost'  # ou o host do seu banco de dados
app.config['MYSQL_USER'] = 'seu_usuario'  # substitua pelo seu usuário
app.config['MYSQL_PASSWORD'] = 'sua_senha'  # substitua pela sua senha
app.config['MYSQL_DB'] = 'seu_banco_de_dados'  # substitua pelo nome do banco

mysql = MySQL(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Rotas existentes (mantenha as que você já tem)
@app.route('/api/login', methods=['POST'])
def login():
    creds = request.json
    cur = mysql.connection.cursor()
    cur.execute("SELECT * FROM users WHERE username = %s AND password = %s", 
               (creds['username'], creds['password']))
    user = cur.fetchone()
    cur.close()
    
    if user:
        return jsonify({
            'id': user[0],
            'username': user[1],
            'role': user[3],
            'assignedCity': user[4]
        }), 200
    return jsonify({}), 401

# Adicione outras rotas conforme necessário

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)