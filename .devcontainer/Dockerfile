FROM mcr.microsoft.com/devcontainers/base:bookworm

# Install Nix in single-user mode for the vscode user
USER vscode
RUN curl -L https://nixos.org/nix/install | bash -s -- --no-daemon
ENV PATH="/home/vscode/.nix-profile/bin:${PATH}"

# Enable flakes (required by .envrc `use flake` and shell.nix `getFlake`).
# Persisted into the image so both this build and the runtime direnv hook work.
RUN mkdir -p /home/vscode/.config/nix \
    && echo 'experimental-features = nix-command flakes' > /home/vscode/.config/nix/nix.conf

# Install direnv via Nix and configure shell hooks
RUN . /home/vscode/.nix-profile/etc/profile.d/nix.sh \
    && nix-env -iA nixpkgs.direnv
RUN echo '. /home/vscode/.nix-profile/etc/profile.d/nix.sh' >> /home/vscode/.bashrc \
    && echo 'eval "$(direnv hook bash)"' >> /home/vscode/.bashrc \
    && echo '. /home/vscode/.nix-profile/etc/profile.d/nix.sh' >> /home/vscode/.zshrc \
    && echo 'eval "$(direnv hook zsh)"' >> /home/vscode/.zshrc

# Pre-populate the nix store with project dependencies so first open is fast.
# Copy the full flake (flake.nix + flake.lock) and evaluate it directly via
# `nix develop` instead of the flake-wrapper shell.nix.
COPY flake.nix flake.lock /tmp/cache/
RUN . /home/vscode/.nix-profile/etc/profile.d/nix.sh \
    && nix develop /tmp/cache --command true
