# Local AI

Open **New tab > Local AI** to run language models on this computer with Ollama.

- **Install:** if Ollama is missing, **Install Ollama** installs it in one click with the Windows Package Manager, or from ollama.com with a signature check. Windows may ask for permission; the app never answers that prompt.
- **Start and stop:** the app starts Ollama on 127.0.0.1:11434 only and stops only an Ollama it started itself.
- **Installed models** show size, parameters, quantization and whether they are loaded, with a fit verdict. Removing a model passes the super confirmation.
- **Model library** is read from ollama.com/library and each model's tags page, with search and the regex builder. Each variant shows its size and a fit verdict: Runs well, Runs with limits, Unlikely or Unknown, based on real size, memory, graphics memory and free disk. It is an estimate, never a promise; unknown sizes give Unknown. If ollama.com cannot be reached, installed models still work.
- **Pull** shows byte progress and can be cancelled.
- **Chat:** streamed answers, stop, a system prompt and temperature, several saved chats, delete with super confirmation, and export as Markdown. Chats are saved only on this computer.

The app talks only to Ollama's documented local API. Nothing is sent to a cloud model.
