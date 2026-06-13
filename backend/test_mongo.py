from pymongo import MongoClient

uri = "mongodb+srv://saikrishnathappeta7_db_user:7uD66Ff4fqFbq1Xi@grindstation.ednavp5.mongodb.net/?retryWrites=true&w=majority&appName=grindstation"

client = MongoClient(uri, serverSelectionTimeoutMS=10000)

print(client.list_database_names())