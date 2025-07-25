import os
from docs_loader import load_documents

def main():
    docs = load_documents("docs/")
    print(f"Ingested {len(docs)} documents.")

if __name__ == "__main__":
    main()
