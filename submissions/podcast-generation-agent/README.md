# Podcast Generation Agent

Turn a topic or source material such as newsletters, articles, reports, and notes into a two-host podcast episode. The agent produces a readable transcript, multi-voice SSML, and optional narrated audio.

## Agent

The agent uses two recurring hosts with distinct voices and conversational roles. It organizes source material into segments, targets the requested episode length, and produces TTS-ready output without narration-style prose.

## Tools and skills

- The podcast script skill analyzes and ranks source material, writes the dialogue, and generates SSML.
- The Azure Text to Speech connector converts the SSML into a WAV audio file when requested.
- Web search is enabled to support requests that require current source material.

## Import notes

- Import the solution into a Copilot Studio environment.
- Configure the included Azure Text to Speech connection reference during import.
- Ensure the connected Speech resource can use `en-US-AvaMultilingualNeural` and `en-US-AndrewMultilingualNeural`, or update the agent to use available neural voices.
- Review the agent and connection configuration before publishing. The exported solution is configured to publish on import.