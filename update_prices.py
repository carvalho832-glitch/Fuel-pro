import json
import requests
from bs4 import BeautifulSoup
import re

def scrape_real():
    url = "https://dedurapreco.com/preco-do-combustivel/sao-paulo/sao-jose-dos-campos?fuelType=GASOLINA"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        print(f"Alvo: {url}")
        response = requests.get(url, headers=headers, timeout=20)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        postos_novos = []
        # No DeDuraPreço, os postos geralmente ficam em tags <a> ou <div> com classes específicas
        cards = soup.find_all(['div', 'a'], class_=re.compile(r'card|station|item', re.I))
        
        if not cards:
            # Se não achar por classe, pega todos os blocos que têm preço dentro
            cards = [el.parent for el in soup.find_all(string=re.compile(r'R\$'))]

        print(f"Analisando {len(cards)} blocos possíveis...")

        for card in cards:
            try:
                texto = card.get_text(separator=" ")
                
                # Procura o Preço (ex: 5,79)
                preco_match = re.search(r'R\$\s?(\d[,\.]\d{2})', texto)
                if not preco_match: continue
                preco = preco_match.group(1).replace(',', '.')

                # Procura o Nome (Geralmente o primeiro texto em negrito ou H2/H3/H4)
                nome_elem = card.find(['h2', 'h3', 'h4', 'strong', 'b'])
                nome = nome_elem.get_text().strip() if nome_elem else "Posto Desconhecido"
                
                # Se o nome for muito curto ou genérico, tenta pegar o primeiro link
                if len(nome) < 3:
                    nome = card.find('a').get_text().strip()

                # Limpeza básica do nome
                nome = nome.split('\n')[0].upper()

                # Evita lixo e duplicados
                if "R$" in nome or len(nome) < 3 or any(p['name'] == nome for p in postos_novos):
                    continue

                # Coordenadas inteligentes por bairro
                lat, lng = -23.189, -45.884
                full = (nome + " " + texto).upper()
                if "AQUARIUS" in full: lat, lng = -23.219, -45.908
                elif "ADYANA" in full: lat, lng = -23.199, -45.895
                elif "CENTRO" in full: lat, lng = -23.185, -45.890
                elif "SATELITE" in full: lat, lng = -23.232, -45.912
                elif "INDUSTRIAL" in full: lat, lng = -23.178, -45.865
                elif "VISTA" in full: lat, lng = -23.195, -45.875
                elif "ROSSI" in full: lat, lng = -23.172, -45.882

                postos_novos.append({
                    "name": nome,
                    "lat": lat,
                    "lng": lng,
                    "prices": {
                        "gas": preco,
                        "eta": str(round(float(preco) * 0.72, 2)),
                        "gas_ad": str(round(float(preco) + 0.15, 2))
                    }
                })
            except:
                continue

        return postos_novos
    except Exception as e:
        print(f"Erro: {e}")
        return []

if __name__ == "__main__":
    resultado = scrape_real()
    if resultado:
        print(f"SUCESSO! {len(resultado)} postos capturados.")
        with open('dados.json', 'w', encoding='utf-8') as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False)
    else:
        print("FALHA: O robô não conseguiu ler os nomes dos postos.")
