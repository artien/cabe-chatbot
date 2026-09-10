# CABE Chatbot

A RAG (Retrieval-Augmented Generation) AI chatbot designed specifically for AFP CABE.

## Overview

This project implements an intelligent chatbot using Retrieval-Augmented Generation (RAG) technology to provide accurate, context-aware responses tailored for AFP CABE (Certified Ai Back End) e-course by Frenki Herlambang. By combining information retrieval with generative AI, the chatbot can answer user queries with relevant information sourced from a curated knowledge base.

## Features

- **🤖 RAG Architecture**: Combines retrieval and generation for accurate, sourced responses
- **💬 Context-Aware Responses**: Leverages company-specific knowledge base for relevant answers
- **🔍 Information Retrieval**: Efficiently retrieves relevant documents before generating responses
- **🎯 Domain-Optimized**: Specialized for AFP CABE services and information
- **📱 Interactive Interface**: User-friendly chatbot interface
- **⚡ Performance Optimized**: Built with TypeScript for type safety and optimal performance

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Architecture**: RAG (Retrieval-Augmented Generation)

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/artien/cabe-chatbot.git
cd cabe-chatbot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (create a `.env` file):
```bash
# Add your configuration here
```

### Usage

Start the chatbot:
```bash
npm start
```

Development mode with hot reload:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Run tests:
```bash
npm test
```

## Project Structure

```
cabe-chatbot/
├── src/                    # Source code
│   ├── components/        # Chatbot components
│   ├── services/          # Business logic and services
│   ├── utils/             # Utility functions
│   └── index.ts           # Entry point
├── dist/                  # Compiled JavaScript output
├── node_modules/          # Dependencies
├── package.json           # Project dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

## How It Works

The CABE Chatbot uses a Retrieval-Augmented Generation approach:

1. **User Input**: User submits a query
2. **Retrieval**: Relevant documents are retrieved from the knowledge base
3. **Generation**: A language model generates a response using the retrieved context
4. **Response**: The chatbot returns an accurate, sourced answer

This approach ensures responses are grounded in actual information rather than generated from training data alone.

## Development

### Build
```bash
npm run build
```

### Development Server
```bash
npm run dev
```

### Testing
```bash
npm test
```

### Code Quality
```bash
npm run lint
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Configuration

The chatbot can be configured through environment variables. See `.env.example` for available options.

## Troubleshooting

**Issue**: Module not found errors
- **Solution**: Ensure all dependencies are installed: `npm install`

**Issue**: TypeScript compilation errors
- **Solution**: Check your TypeScript version: `npm list typescript`

**Issue**: Port already in use
- **Solution**: Change the port in your configuration or kill the process using the port

## Performance

- Optimized for fast response times
- Efficient knowledge base indexing
- Scalable architecture for handling multiple concurrent users

## Security

- Input sanitization for user queries
- Secure API communication
- Environment-based configuration for sensitive data

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support & Contact

For questions, bug reports, or feature requests, please:
- Open an issue on the GitHub repository
- Check existing documentation
- Review closed issues for similar problems

---

**Made with ❤️ for AFP CABE**

Last updated: 2026
