// src/utils/promptData.ts

const promptData: { [key: string]: { [key: string]: string } } = {
  de: {
    'Summarize text': `Bitte fassen Sie den folgenden Text in 3-4 prägnanten Stichpunkten zusammen und heben Sie dabei die Hauptideen und wichtigsten Erkenntnisse hervor:`,
    Brainstorm: `Ich brauche Hilfe beim Brainstorming von Ideen für eine neue mobile App. Die App sollte sich auf die Verbesserung der persönlichen Produktivität konzentrieren. Bitte erstellen Sie eine Liste von 5-7 innovativen App-Konzepten, jeweils mit einer kurzen Beschreibung der Kernfunktionalität und potenziellen Nutzervorteile.`,
    'Analyze data': `Ich habe einen Datensatz mit Kundenfeedback für eine Restaurantkette. Bitte analysieren Sie diese Daten, um Trends, häufige Beschwerden und Verbesserungsmöglichkeiten zu identifizieren. Die Daten umfassen Bewertungen (1-5 Sterne) und schriftliche Kommentare. Geben Sie eine Zusammenfassung Ihrer Ergebnisse und schlagen Sie drei umsetzbare Empfehlungen basierend auf der Analyse vor.`,
    'Make a plan': `Ich möchte einen erfolgreichen YouTube-Kanal starten, der sich auf nachhaltiges Leben und umweltfreundliche Lifestyle-Tipps konzentriert. Bitte erstellen Sie einen detaillierten 3-Monats-Inhaltsplan, der Folgendes enthält:
    1. Kanalthema und Zielgruppe
    2. Inhaltssäulen (Hauptthemen)
    3. Video-Ideen für die ersten 12 Videos (Titel und kurze Beschreibungen)
    4. Veröffentlichungsplan
    5. Ideen für Publikumsengagement und Wachstumsstrategien
    6. Potenzielle Kooperationen oder Partnerschaften
    Bitte erstellen Sie einen umfassenden Plan, dem ich folgen kann, um meinen YouTube-Kanal zu starten.`,
    'Help me write': `Ich brauche Hilfe beim Verfassen eines überzeugenden Anschreibens für eine Stelle als Softwareingenieur bei einem führenden Technologieunternehmen. Die Stellenbeschreibung betont Fähigkeiten in Full-Stack-Entwicklung, agilen Methoden und Erfahrung mit Cloud-Plattformen. Bitte verfassen Sie ein professionelles Anschreiben, das:
    1. Meinen Hintergrund als Softwareingenieur mit 5 Jahren Erfahrung vorstellt
    2. Meine relevanten Fähigkeiten und Errungenschaften hervorhebt und sie mit den Jobanforderungen in Einklang bringt
    3. Meine Leidenschaft für Technologie und kontinuierliches Lernen demonstriert
    4. Erklärt, warum ich mich für dieses spezifische Unternehmen und diese Position interessiere
    5. Mit einem starken Handlungsaufruf abschließt
    
    Bitte schreiben Sie das vollständige Anschreiben und behalten Sie dabei durchgehend einen professionellen, aber ansprechenden Ton bei. Das Schreiben sollte etwa 300-400 Wörter lang sein.`,
  },
  'en-GB': {
    'Summarize text': `Please summarise the following text in 3-4 concise bullet points, highlighting the main ideas and key takeaways:`,
    Brainstorm: `I need help brainstorming ideas for a new mobile app. The app should focus on improving personal productivity. Please generate a list of 5-7 innovative app concepts, each with a brief description of its core functionality and potential user benefits.`,
    'Analyze data': `I have a dataset of customer feedback for a restaurant chain. Please analyse this data to identify trends, common complaints, and areas for improvement. The data includes ratings (1-5 stars) and written comments. Provide a summary of your findings and suggest three actionable recommendations based on the analysis.`,
    'Make a plan': `I want to launch a successful YouTube channel focused on sustainable living and eco-friendly lifestyle tips. Please create a detailed 3-month content plan that includes the following:
    1. Channel theme and target audience
    2. Content pillars (main topics to cover)
    3. Video ideas for the first 12 videos (titles and brief descriptions)
    4. Posting schedule
    5. Ideas for audience engagement and growth strategies
    6. Potential collaborations or partnerships to explore
    Please provide a comprehensive plan that I can follow to kickstart my YouTube channel.`,
    'Help me write': `I need help writing a compelling cover letter for a software engineering position at a leading tech company. The job description emphasises skills in full-stack development, agile methodologies, and experience with cloud platforms. Please draft a professional cover letter that:
    1. Introduces my background as a software engineer with 5 years of experience
    2. Highlights my relevant skills and achievements, aligning them with the job requirements
    3. Demonstrates my passion for technology and continuous learning
    4. Explains why I'm interested in this specific company and position
    5. Concludes with a strong call-to-action
    
    Please write the full cover letter, maintaining a professional yet engaging tone throughout. The letter should be approximately 300-400 words long.`,
  },
  en: {
    'Summarize text': `Please summarize the following text in 3-4 concise bullet points, highlighting the main ideas and key takeaways:`,
    Brainstorm: `I need help brainstorming ideas for a new mobile app. The app should focus on improving personal productivity. Please generate a list of 5-7 innovative app concepts, each with a brief description of its core functionality and potential user benefits.`,
    'Analyze data': `I have a dataset of customer feedback for a restaurant chain. Please analyze this data to identify trends, common complaints, and areas for improvement. The data includes ratings (1-5 stars) and written comments. Provide a summary of your findings and suggest three actionable recommendations based on the analysis.`,
    'Make a plan': `I want to launch a successful YouTube channel focused on sustainable living and eco-friendly lifestyle tips. Please create a detailed 3-month content plan that includes the following:
    1. Channel theme and target audience
    2. Content pillars (main topics to cover)
    3. Video ideas for the first 12 videos (titles and brief descriptions)
    4. Posting schedule
    5. Ideas for audience engagement and growth strategies
    6. Potential collaborations or partnerships to explore
    Please provide a comprehensive plan that I can follow to kickstart my YouTube channel.`,
    'Help me write': `I need help writing a compelling cover letter for a software engineering position at a leading tech company. The job description emphasizes skills in full-stack development, agile methodologies, and experience with cloud platforms. Please draft a professional cover letter that:
    1. Introduces my background as a software engineer with 5 years of experience
    2. Highlights my relevant skills and achievements, aligning them with the job requirements
    3. Demonstrates my passion for technology and continuous learning
    4. Explains why I'm interested in this specific company and position
    5. Concludes with a strong call-to-action
    
    Please write the full cover letter, maintaining a professional yet engaging tone throughout. The letter should be approximately 300-400 words long.`,
  },
  es: {
    'Summarize text': `Por favor, resume el siguiente texto en 3-4 puntos concisos, destacando las ideas principales y los puntos clave:`,
    Brainstorm: `Necesito ayuda para hacer una lluvia de ideas para una nueva aplicación móvil. La aplicación debe centrarse en mejorar la productividad personal. Por favor, genera una lista de 5-7 conceptos innovadores de aplicaciones, cada uno con una breve descripción de su funcionalidad principal y los beneficios potenciales para el usuario.`,
    'Analyze data': `Tengo un conjunto de datos de retroalimentación de clientes para una cadena de restaurantes. Por favor, analiza estos datos para identificar tendencias, quejas comunes y áreas de mejora. Los datos incluyen calificaciones (1-5 estrellas) y comentarios escritos. Proporciona un resumen de tus hallazgos y sugiere tres recomendaciones accionables basadas en el análisis.`,
    'Make a plan': `Quiero lanzar un canal de YouTube exitoso centrado en la vida sostenible y consejos de estilo de vida ecológico. Por favor, crea un plan de contenido detallado de 3 meses que incluya lo siguiente:
    1. Tema del canal y público objetivo
    2. Pilares de contenido (temas principales a cubrir)
    3. Ideas de video para los primeros 12 videos (títulos y breves descripciones)
    4. Calendario de publicación
    5. Ideas para el compromiso de la audiencia y estrategias de crecimiento
    6. Posibles colaboraciones o asociaciones a explorar
    Por favor, proporciona un plan integral que pueda seguir para iniciar mi canal de YouTube.`,
    'Help me write': `Necesito ayuda para escribir una carta de presentación convincente para un puesto de ingeniero de software en una empresa tecnológica líder. La descripción del trabajo enfatiza habilidades en desarrollo full-stack, metodologías ágiles y experiencia con plataformas en la nube. Por favor, redacta una carta de presentación profesional que:
    1. Introduzca mi experiencia como ingeniero de software con 5 años de experiencia
    2. Destaque mis habilidades y logros relevantes, alineándolos con los requisitos del trabajo
    3. Demuestre mi pasión por la tecnología y el aprendizaje continuo
    4. Explique por qué estoy interesado en esta empresa y posición específica
    5. Concluya con una fuerte llamada a la acción
    
    Por favor, escribe la carta de presentación completa, manteniendo un tono profesional pero atractivo en todo momento. La carta debe tener aproximadamente 300-400 palabras de longitud.`,
  },
  fr: {
    'Summarize text': `Veuillez résumer le texte suivant en 3-4 points concis, en mettant en évidence les idées principales et les points clés à retenir :`,
    Brainstorm: `J'ai besoin d'aide pour réfléchir à des idées pour une nouvelle application mobile. L'application devrait se concentrer sur l'amélioration de la productivité personnelle. Veuillez générer une liste de 5 à 7 concepts d'applications innovantes, chacun avec une brève description de sa fonctionnalité principale et des avantages potentiels pour l'utilisateur.`,
    'Analyze data': `J'ai un ensemble de données de retour client pour une chaîne de restaurants. Veuillez analyser ces données pour identifier les tendances, les plaintes courantes et les domaines d'amélioration. Les données comprennent des évaluations (1-5 étoiles) et des commentaires écrits. Fournissez un résumé de vos conclusions et suggérez trois recommandations pratiques basées sur l'analyse.`,
    'Make a plan': `Je veux lancer une chaîne YouTube réussie axée sur la vie durable et les conseils de mode de vie écologique. Veuillez créer un plan de contenu détaillé sur 3 mois qui comprend les éléments suivants :
    1. Thème de la chaîne et public cible
    2. Piliers de contenu (principaux sujets à couvrir)
    3. Idées de vidéos pour les 12 premières vidéos (titres et brèves descriptions)
    4. Calendrier de publication
    5. Idées pour l'engagement du public et les stratégies de croissance
    6. Collaborations ou partenariats potentiels à explorer
    Veuillez fournir un plan complet que je peux suivre pour lancer ma chaîne YouTube.`,
    'Help me write': `J'ai besoin d'aide pour rédiger une lettre de motivation convaincante pour un poste d'ingénieur logiciel dans une grande entreprise technologique. La description du poste met l'accent sur les compétences en développement full-stack, les méthodologies agiles et l'expérience des plateformes cloud. Veuillez rédiger une lettre de motivation professionnelle qui :
    1. Présente mon expérience en tant qu'ingénieur logiciel avec 5 ans d'expérience
    2. Met en évidence mes compétences et réalisations pertinentes, en les alignant sur les exigences du poste
    3. Démontre ma passion pour la technologie et l'apprentissage continu
    4. Explique pourquoi je suis intéressé par cette entreprise et ce poste spécifiques
    5. Conclut par un appel à l'action fort
    
    Veuillez rédiger la lettre de motivation complète, en maintenant un ton professionnel mais engageant tout au long. La lettre doit avoir environ 300-400 mots.`,
  },
  it: {
    'Summarize text': `Per favore, riassumi il seguente testo in 3-4 punti concisi, evidenziando le idee principali e i punti chiave:`,
    Brainstorm: `Ho bisogno di aiuto per fare brainstorming di idee per una nuova app mobile. L'app dovrebbe concentrarsi sul miglioramento della produttività personale. Per favore, genera una lista di 5-7 concetti innovativi di app, ciascuno con una breve descrizione della sua funzionalità principale e dei potenziali benefici per l'utente.`,
    'Analyze data': `Ho un set di dati di feedback dei clienti per una catena di ristoranti. Per favore, analizza questi dati per identificare tendenze, lamentele comuni e aree di miglioramento. I dati includono valutazioni (1-5 stelle) e commenti scritti. Fornisci un riassunto delle tue scoperte e suggerisci tre raccomandazioni attuabili basate sull'analisi.`,
    'Make a plan': `Voglio lanciare un canale YouTube di successo incentrato sulla vita sostenibile e consigli per uno stile di vita ecologico. Per favore, crea un piano dettagliato di contenuti per 3 mesi che includa quanto segue:
    1. Tema del canale e pubblico target
    2. Pilastri di contenuto (principali argomenti da coprire)
    3. Idee per video per i primi 12 video (titoli e brevi descrizioni)
    4. Programma di pubblicazione
    5. Idee per il coinvolgimento del pubblico e strategie di crescita
    6. Potenziali collaborazioni o partnership da esplorare
    Per favore, fornisci un piano completo che posso seguire per avviare il mio canale YouTube.`,
    'Help me write': `Ho bisogno di aiuto per scrivere una lettera di presentazione convincente per una posizione di ingegnere software presso un'azienda tecnologica leader. La descrizione del lavoro enfatizza competenze nello sviluppo full-stack, metodologie agili ed esperienza con piattaforme cloud. Per favore, redigi una lettera di presentazione professionale che:
    1. Introduca il mio background come ingegnere software con 5 anni di esperienza
    2. Evidenzi le mie competenze e i miei successi rilevanti, allineandoli con i requisiti del lavoro
    3. Dimostri la mia passione per la tecnologia e l'apprendimento continuo
    4. Spieghi perché sono interessato a questa specifica azienda e posizione
    5. Concluda con una forte call-to-action
    
    Per favore, scrivi la lettera di presentazione completa, mantenendo un tono professionale ma coinvolgente per tutto il testo. La lettera dovrebbe essere lunga circa 300-400 parole.`,
  },
  ja: {
    'Summarize text': `以下の文章を3〜4つの簡潔な箇条書きにまとめ、主なアイデアと重要なポイントを強調してください：`,
    Brainstorm: `新しいモバイルアプリのアイデアを考えるのに助けが必要です。このアプリは個人の生産性向上に焦点を当てるべきです。5〜7つの革新的なアプリのコンセプトをリストアップし、それぞれの主要機能と潜在的なユーザーメリットについて簡単に説明してください。`,
    'Analyze data': `レストランチェーンの顧客フィードバックデータセットがあります。このデータを分析して、傾向、一般的な苦情、改善が必要な分野を特定してください。データには評価（1〜5つ星）と書面によるコメントが含まれています。分析結果の要約を提供し、分析に基づいて3つの実行可能な推奨事項を提案してください。`,
    'Make a plan': `持続可能な生活とエコフレンドリーなライフスタイルのヒントに焦点を当てた成功するYouTubeチャンネルを立ち上げたいと思います。以下を含む詳細な3ヶ月のコンテンツプランを作成してください：
    1. チャンネルのテーマとターゲット視聴者
    2. コンテンツの柱（カバーする主要トピック）
    3. 最初の12本の動画のアイデア（タイトルと簡単な説明）
    4. 投稿スケジュール
    5. 視聴者エンゲージメントと成長戦略のアイデア
    6. 探索すべき潜在的なコラボレーションやパートナーシップ
    YouTubeチャンネルを立ち上げるために従うことができる包括的なプランを提供してください。`,
    'Help me write': `大手テクノロジー企業のソフトウェアエンジニアポジションに応募するための説得力のあるカバーレターを書くのに助けが必要です。職務内容にはフルスタック開発、アジャイル方法論、クラウドプラットフォームの経験が強調されています。以下の要素を含む専門的なカバーレターを作成してください：
    1. ソフトウェアエンジニアとしての5年の経験を持つ私の背景を紹介
    2. 職務要件に合わせて、関連するスキルと実績を強調
    3. テクノロジーと継続的な学習への情熱を示す
    4. なぜこの特定の会社とポジションに興味があるのかを説明
    5. 強力な行動喚起で締めくくる
    
    カバーレター全体を書いてください。専門的でありながら魅力的なトーンを全体的に維持してください。文字数は約300〜400語程度にしてください。`,
  },
};

export default promptData;
