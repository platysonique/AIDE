import os

def load_documents(path):
    docs = []
    for fn in os.listdir(path):
        if fn.lower().endswith(('.pdf', '.txt', '.docx', '.md', '.epub', '.jpg', '.png')):
            docs.append({"file": fn})
    return docs
